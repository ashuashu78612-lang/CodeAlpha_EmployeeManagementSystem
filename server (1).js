const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5001;
const SECRET = process.env.JWT_SECRET || "development_secret";

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/codealpha_project_manager")
  .then(() => console.log("MongoDB connected"))
  .catch(err => console.error("MongoDB error:", err.message));

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String
}, { timestamps: true });

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  status: { type: String, enum: ["todo", "progress", "done"], default: "todo" },
  assignee: String,
  comments: [{ user: String, text: String, createdAt: { type: Date, default: Date.now } }]
}, { timestamps: true });

const projectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  tasks: [{ type: mongoose.Schema.Types.ObjectId, ref: "Task" }]
}, { timestamps: true });

const User = mongoose.model("User", userSchema);
const Task = mongoose.model("Task", taskSchema);
const Project = mongoose.model("Project", projectSchema);

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ message: "Login required" });

  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
}

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields required" });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: "Email already registered" });

    const hash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: email.toLowerCase(), password: hash });
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, SECRET, { expiresIn: "4h" });
    res.status(201).json({ token, user: { name: user.name, email: user.email } });
  } catch {
    res.status(500).json({ message: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: (req.body.email || "").toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password || "", user.password))) {
      return res.status(401).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign({ id: user._id, name: user.name, email: user.email }, SECRET, { expiresIn: "4h" });
    res.json({ token, user: { name: user.name, email: user.email } });
  } catch {
    res.status(500).json({ message: "Login failed" });
  }
});

app.get("/api/projects", auth, async (req, res) => {
  const projects = await Project.find({ $or: [{ owner: req.user.id }, { members: req.user.id }] })
    .populate("tasks").sort({ createdAt: -1 });
  res.json(projects);
});

app.post("/api/projects", auth, async (req, res) => {
  const project = await Project.create({
    name: req.body.name,
    description: req.body.description || "",
    owner: req.user.id,
    members: [req.user.id]
  });
  res.status(201).json(project);
});

app.post("/api/projects/:id/tasks", auth, async (req, res) => {
  const project = await Project.findOne({
    _id: req.params.id,
    $or: [{ owner: req.user.id }, { members: req.user.id }]
  });
  if (!project) return res.status(404).json({ message: "Project not found" });

  const task = await Task.create({
    title: req.body.title,
    description: req.body.description || "",
    assignee: req.body.assignee || ""
  });
  project.tasks.push(task._id);
  await project.save();
  res.status(201).json(task);
});

app.patch("/api/tasks/:id", auth, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });

  if (req.body.title !== undefined) task.title = req.body.title;
  if (req.body.description !== undefined) task.description = req.body.description;
  if (req.body.assignee !== undefined) task.assignee = req.body.assignee;
  if (req.body.status !== undefined) task.status = req.body.status;

  await task.save();
  res.json(task);
});

app.post("/api/tasks/:id/comments", auth, async (req, res) => {
  const task = await Task.findById(req.params.id);
  if (!task) return res.status(404).json({ message: "Task not found" });
  if (!req.body.text) return res.status(400).json({ message: "Comment cannot be empty" });

  task.comments.push({ user: req.user.name, text: req.body.text });
  await task.save();
  res.json(task);
});

app.delete("/api/tasks/:id", auth, async (req, res) => {
  await Task.findByIdAndDelete(req.params.id);
  await Project.updateMany({}, { $pull: { tasks: req.params.id } });
  res.json({ message: "Task deleted" });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Project Manager running at http://localhost:${PORT}`));