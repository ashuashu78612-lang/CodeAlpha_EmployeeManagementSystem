let token = localStorage.getItem("pm_token");

function headers() {
  return { "Content-Type": "application/json", "Authorization": `Bearer ${token}` };
}

function openAuth() { document.getElementById("auth").classList.remove("hidden"); }
function closeAuth() { document.getElementById("auth").classList.add("hidden"); }

async function register() {
  const body = {
    name: document.getElementById("authName").value.trim(),
    email: document.getElementById("authEmail").value.trim(),
    password: document.getElementById("authPassword").value
  };
  const res = await fetch("/api/register", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();
  document.getElementById("authMsg").textContent = data.message || (data.token ? "Registered" : "Registration failed");
  if (data.token) {
    token = data.token;
    localStorage.setItem("pm_token", token);
    closeAuth();
    loadProjects();
  }
}

async function login() {
  const body = {
    email: document.getElementById("authEmail").value.trim(),
    password: document.getElementById("authPassword").value
  };
  const res = await fetch("/api/login", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify(body) });
  const data = await res.json();
  document.getElementById("authMsg").textContent = data.message || (data.token ? "Logged in" : "Login failed");
  if (data.token) {
    token = data.token;
    localStorage.setItem("pm_token", token);
    closeAuth();
    loadProjects();
  }
}

function logout() {
  token = null;
  localStorage.removeItem("pm_token");
  document.getElementById("projects").innerHTML = "<p>Please login to use TaskFlow.</p>";
}

async function createProject() {
  if (!token) return openAuth();
  const name = prompt("Project name:");
  if (!name) return;
  const description = prompt("Project description:") || "";

  const res = await fetch("/api/projects", {
    method: "POST", headers: headers(),
    body: JSON.stringify({ name, description })
  });
  if (res.ok) loadProjects();
}

async function loadProjects() {
  if (!token) {
    document.getElementById("projects").innerHTML = "<p>Please login to use TaskFlow.</p>";
    return;
  }

  const res = await fetch("/api/projects", { headers: headers() });
  if (!res.ok) return logout();

  const projects = await res.json();
  document.getElementById("projects").innerHTML = projects.length
    ? projects.map(projectHTML).join("")
    : "<p>No projects yet. Click '+ New Project'.</p>";
}

function projectHTML(p) {
  const tasks = p.tasks || [];
  return `
    <section class="project">
      <h2>${escapeHTML(p.name)}</h2>
      <p>${escapeHTML(p.description || "")}</p>
      <button class="primary" onclick="addTask('${p._id}')">+ Add Task</button>
      <div class="board">
        ${columnHTML("todo", "To Do", tasks)}
        ${columnHTML("progress", "In Progress", tasks)}
        ${columnHTML("done", "Done", tasks)}
      </div>
    </section>
  `;
}

function columnHTML(status, title, tasks) {
  return `<div class="column"><h3>${title}</h3>${tasks.filter(t => t.status === status).map(taskHTML).join("")}</div>`;
}

function taskHTML(t) {
  return `
    <div class="task">
      <strong>${escapeHTML(t.title)}</strong>
      <p>${escapeHTML(t.description || "")}</p>
      <small>Assignee: ${escapeHTML(t.assignee || "Unassigned")}</small><br>
      <select onchange="changeStatus('${t._id}', this.value)">
        <option value="todo" ${t.status==="todo"?"selected":""}>To Do</option>
        <option value="progress" ${t.status==="progress"?"selected":""}>In Progress</option>
        <option value="done" ${t.status==="done"?"selected":""}>Done</option>
      </select>
      <button onclick="commentTask('${t._id}')">Comment</button>
      <button onclick="deleteTask('${t._id}')">Delete</button>
      ${(t.comments || []).map(c => `<div class="comment"><b>${escapeHTML(c.user)}:</b> ${escapeHTML(c.text)}</div>`).join("")}
    </div>
  `;
}

async function addTask(projectId) {
  const title = prompt("Task title:");
  if (!title) return;
  const description = prompt("Task description:") || "";
  const assignee = prompt("Assign to (name/email):") || "";

  await fetch(`/api/projects/${projectId}/tasks`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ title, description, assignee })
  });
  loadProjects();
}

async function changeStatus(id, status) {
  await fetch(`/api/tasks/${id}`, {
    method: "PATCH", headers: headers(),
    body: JSON.stringify({ status })
  });
  loadProjects();
}

async function commentTask(id) {
  const text = prompt("Write a comment:");
  if (!text) return;
  await fetch(`/api/tasks/${id}/comments`, {
    method: "POST", headers: headers(),
    body: JSON.stringify({ text })
  });
  loadProjects();
}

async function deleteTask(id) {
  if (!confirm("Delete this task?")) return;
  await fetch(`/api/tasks/${id}`, { method: "DELETE", headers: headers() });
  loadProjects();
}

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, c => ({
    "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;"
  }[c]));
}

loadProjects();