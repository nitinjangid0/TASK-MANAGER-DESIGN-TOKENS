'use strict';

/* ==========================================================================
   TASK MANAGER — script.js
   Demonstrates: state management, CRUD, localStorage persistence,
   dynamic DOM creation, event delegation, filtering, search, sorting.
   ========================================================================== */

/* ------------------------------------------------------------------------
   1. STATE
   A single source of truth. Every user action flows through:
   Action -> update `tasks` -> saveTasks() -> render() -> updateStats()
   ------------------------------------------------------------------------ */
const STORAGE_KEY = 'thiranex_tasks';

/** @type {Array<{id:string,title:string,description:string,priority:string,dueDate:string,completed:boolean,createdAt:number}>} */
let tasks = [];

// UI state (not persisted): current filter, search term, sort order
let currentFilter = 'all';       // 'all' | 'active' | 'completed'
let currentSearch = '';
let currentSort = 'newest';      // 'newest' | 'oldest' | 'priority' | 'dueDate'
let taskPendingDeleteId = null;  // id awaiting confirmation in the delete modal

// Sample data used only the very first time the app runs (empty storage).
// Structured as its own function so it can be deleted with zero side effects.
function getSampleTasks() {
  const today = new Date();
  const inDays = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  return [
    { id: createId(), title: 'Complete JavaScript Assignment', description: 'Finish CRUD, state, and localStorage logic for the Thiranex task.', priority: 'High', dueDate: inDays(2), completed: false, createdAt: Date.now() - 4000 },
    { id: createId(), title: 'Build Portfolio Website', description: 'Add the new projects section and update the about page.', priority: 'Medium', dueDate: inDays(6), completed: false, createdAt: Date.now() - 3000 },
    { id: createId(), title: 'Learn React Fundamentals', description: 'Go through components, props, and hooks.', priority: 'Low', dueDate: inDays(14), completed: false, createdAt: Date.now() - 2000 },
    { id: createId(), title: 'Update Resume', description: '', priority: 'Medium', dueDate: inDays(-1), completed: false, createdAt: Date.now() - 1000 },
    { id: createId(), title: 'Practice DSA', description: 'Two array problems and one tree problem.', priority: 'High', dueDate: inDays(1), completed: true, createdAt: Date.now() },
  ];
}

/* ------------------------------------------------------------------------
   2. UNIQUE ID
   Never reuse array indexes as IDs, since they shift on delete/sort/filter.
   ------------------------------------------------------------------------ */
function createId() {
  return `t_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ------------------------------------------------------------------------
   3. LOCALSTORAGE (READ / persistence)
   ------------------------------------------------------------------------ */
function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) {
      // First run: seed with sample data so the UI isn't empty on first look.
      tasks = getSampleTasks();
      saveTasks();
      return;
    }
    const parsed = JSON.parse(raw);
    // Guard against corrupted/invalid data shapes.
    tasks = Array.isArray(parsed) ? parsed.filter(isValidTaskShape) : [];
  } catch (err) {
    console.error('Failed to load tasks from localStorage:', err);
    tasks = [];
  }
}

function isValidTaskShape(t) {
  return t && typeof t === 'object' && typeof t.id === 'string' && typeof t.title === 'string';
}

function saveTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  } catch (err) {
    console.error('Failed to save tasks to localStorage:', err);
    showToast('Could not save — storage may be full.');
  }
}

/* ------------------------------------------------------------------------
   4. CRUD OPERATIONS
   ------------------------------------------------------------------------ */

// CREATE
function addTask({ title, description, priority, dueDate }) {
  const newTask = {
    id: createId(),
    title: title.trim(),
    description: description.trim(),
    priority: priority || 'Medium',
    dueDate: dueDate || '',
    completed: false,
    createdAt: Date.now(),
  };
  tasks.push(newTask);
  saveTasks();
  render();
  showToast('Task added.');
}

// UPDATE
function updateTask(id, changes) {
  const idx = tasks.findIndex((t) => t.id === id);
  if (idx === -1) return;
  tasks[idx] = { ...tasks[idx], ...changes };
  saveTasks();
  render();
  showToast('Task updated.');
}

// DELETE
function deleteTask(id) {
  tasks = tasks.filter((t) => t.id !== id);
  saveTasks();
  render();
  showToast('Task deleted.');
}

// TOGGLE COMPLETE / INCOMPLETE
function toggleTask(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;
  task.completed = !task.completed;
  saveTasks();
  render();
}

/* ------------------------------------------------------------------------
   5. FILTER / SEARCH / SORT (pure functions over the state array)
   ------------------------------------------------------------------------ */
function filterTasks(list, filter) {
  if (filter === 'active') return list.filter((t) => t.completed === false);
  if (filter === 'completed') return list.filter((t) => t.completed === true);
  return list;
}

function searchTasks(list, term) {
  const q = term.trim().toLowerCase();
  if (!q) return list;
  return list.filter(
    (t) => t.title.toLowerCase().includes(q) || t.description.toLowerCase().includes(q)
  );
}

function sortTasks(list, sortBy) {
  const priorityRank = { High: 0, Medium: 1, Low: 2 };
  const copy = [...list]; // never mutate state in place while sorting
  switch (sortBy) {
    case 'oldest':
      return copy.sort((a, b) => a.createdAt - b.createdAt);
    case 'priority':
      return copy.sort((a, b) => priorityRank[a.priority] - priorityRank[b.priority]);
    case 'dueDate':
      return copy.sort((a, b) => {
        if (!a.dueDate) return 1;   // tasks with no due date sink to the bottom
        if (!b.dueDate) return -1;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
    case 'newest':
    default:
      return copy.sort((a, b) => b.createdAt - a.createdAt);
  }
}

function getVisibleTasks() {
  let result = filterTasks(tasks, currentFilter);
  result = searchTasks(result, currentSearch);
  result = sortTasks(result, currentSort);
  return result;
}

function isOverdue(task) {
  if (task.completed || !task.dueDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(task.dueDate) < today;
}

/* ------------------------------------------------------------------------
   6. RENDERING
   Dynamic DOM creation — task cards are built with createElement/template
   literals and inserted; user text always goes through textContent so
   it can never be interpreted as markup.
   ------------------------------------------------------------------------ */
const taskListEl = document.getElementById('taskList');
const emptyStateEl = document.getElementById('emptyState');
const emptyTitleEl = document.getElementById('emptyTitle');
const emptyTextEl = document.getElementById('emptyText');

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

function renderTask(task) {
  const card = document.createElement('article');
  card.className = 'task-card' + (task.completed ? ' is-completed' : '');
  card.dataset.id = task.id;
  card.dataset.priority = task.priority;

  // --- top row: checkbox + title/description ---
  const top = document.createElement('div');
  top.className = 'task-card-top';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'task-checkbox';
  checkbox.checked = task.completed;
  checkbox.setAttribute('aria-label', `Mark "${task.title}" as ${task.completed ? 'active' : 'completed'}`);
  checkbox.dataset.action = 'toggle';

  const body = document.createElement('div');
  body.className = 'task-body';

  const title = document.createElement('p');
  title.className = 'task-title';
  title.textContent = task.title; // textContent: never inject raw HTML from user input

  body.appendChild(title);

  if (task.description) {
    const desc = document.createElement('p');
    desc.className = 'task-description';
    desc.textContent = task.description;
    body.appendChild(desc);
  }

  top.appendChild(checkbox);
  top.appendChild(body);
  card.appendChild(top);

  // --- meta row: priority badge, due date, overdue flag ---
  const meta = document.createElement('div');
  meta.className = 'task-meta';

  const priorityBadge = document.createElement('span');
  priorityBadge.className = `badge badge-priority-${task.priority}`;
  priorityBadge.textContent = task.priority;
  meta.appendChild(priorityBadge);

  if (task.dueDate) {
    const dateBadge = document.createElement('span');
    dateBadge.className = 'badge badge-date';
    dateBadge.textContent = formatDate(task.dueDate);
    meta.appendChild(dateBadge);
  }

  if (isOverdue(task)) {
    const overdueBadge = document.createElement('span');
    overdueBadge.className = 'badge badge-overdue';
    overdueBadge.textContent = 'Overdue';
    meta.appendChild(overdueBadge);
  }

  card.appendChild(meta);

  // --- actions: edit / delete ---
  const actions = document.createElement('div');
  actions.className = 'task-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'icon-btn';
  editBtn.textContent = 'Edit';
  editBtn.dataset.action = 'edit';
  editBtn.setAttribute('aria-label', `Edit "${task.title}"`);

  const deleteBtn = document.createElement('button');
  deleteBtn.type = 'button';
  deleteBtn.className = 'icon-btn danger';
  deleteBtn.textContent = 'Delete';
  deleteBtn.dataset.action = 'delete';
  deleteBtn.setAttribute('aria-label', `Delete "${task.title}"`);

  actions.appendChild(editBtn);
  actions.appendChild(deleteBtn);
  card.appendChild(actions);

  return card;
}

function renderTasks() {
  const visible = getVisibleTasks();
  taskListEl.innerHTML = ''; // safe: clearing only, no user data written via innerHTML

  if (visible.length === 0) {
    taskListEl.hidden = true;
    emptyStateEl.hidden = false;
    setEmptyStateMessage();
    return;
  }

  taskListEl.hidden = false;
  emptyStateEl.hidden = true;

  const fragment = document.createDocumentFragment();
  visible.forEach((task) => fragment.appendChild(renderTask(task)));
  taskListEl.appendChild(fragment);
}

function setEmptyStateMessage() {
  if (tasks.length === 0) {
    emptyTitleEl.textContent = 'No tasks yet';
    emptyTextEl.textContent = 'Add your first task to get started.';
  } else if (currentSearch.trim()) {
    emptyTitleEl.textContent = 'No matching tasks';
    emptyTextEl.textContent = 'Try a different search term.';
  } else if (currentFilter === 'completed') {
    emptyTitleEl.textContent = 'No completed tasks';
    emptyTextEl.textContent = 'Complete a task and it will appear here.';
  } else if (currentFilter === 'active') {
    emptyTitleEl.textContent = 'No active tasks';
    emptyTextEl.textContent = 'Everything is done — nice work.';
  } else {
    emptyTitleEl.textContent = 'No tasks found';
    emptyTextEl.textContent = 'Add your first task to get started.';
  }
}

/* ------------------------------------------------------------------------
   7. STATISTICS
   ------------------------------------------------------------------------ */
const statTotalEl = document.getElementById('statTotal');
const statActiveEl = document.getElementById('statActive');
const statCompletedEl = document.getElementById('statCompleted');
const statOverdueEl = document.getElementById('statOverdue');
const ringProgressEl = document.getElementById('ringProgress');
const ringLabelEl = document.getElementById('ringLabel');
const RING_CIRCUMFERENCE = 2 * Math.PI * 32; // matches r=32 in the SVG

function updateStats() {
  const total = tasks.length;
  const completed = tasks.filter((t) => t.completed).length;
  const active = total - completed;
  const overdue = tasks.filter(isOverdue).length;

  statTotalEl.textContent = total;
  statActiveEl.textContent = active;
  statCompletedEl.textContent = completed;
  statOverdueEl.textContent = overdue;

  const pct = total === 0 ? 0 : Math.round((completed / total) * 100);
  const offset = RING_CIRCUMFERENCE - (pct / 100) * RING_CIRCUMFERENCE;
  ringProgressEl.style.strokeDasharray = String(RING_CIRCUMFERENCE);
  ringProgressEl.style.strokeDashoffset = String(offset);
  ringLabelEl.textContent = `${pct}%`;
}

function render() {
  renderTasks();
  updateStats();
}

/* ------------------------------------------------------------------------
   8. ADD TASK FORM + VALIDATION
   ------------------------------------------------------------------------ */
const taskForm = document.getElementById('taskForm');
const titleInput = document.getElementById('taskTitle');
const descriptionInput = document.getElementById('taskDescription');
const priorityInput = document.getElementById('taskPriority');
const dueDateInput = document.getElementById('taskDueDate');
const titleErrorEl = document.getElementById('titleError');

taskForm.addEventListener('submit', (event) => {
  event.preventDefault();

  const title = titleInput.value.trim();
  if (!title) {
    titleInput.classList.add('has-error');
    titleErrorEl.textContent = 'Please enter a task title.';
    titleInput.focus();
    return;
  }

  titleInput.classList.remove('has-error');
  titleErrorEl.textContent = '';

  addTask({
    title,
    description: descriptionInput.value,
    priority: priorityInput.value,
    dueDate: dueDateInput.value,
  });

  taskForm.reset();
  priorityInput.value = 'Medium';
  titleInput.focus();
});

// Clear the inline error as soon as the user starts fixing it
titleInput.addEventListener('input', () => {
  if (titleInput.value.trim()) {
    titleInput.classList.remove('has-error');
    titleErrorEl.textContent = '';
  }
});

/* ------------------------------------------------------------------------
   9. SEARCH / FILTER / SORT CONTROLS
   ------------------------------------------------------------------------ */
const searchInput = document.getElementById('searchInput');
const filterButtons = document.querySelectorAll('.filter-btn');
const sortSelect = document.getElementById('sortSelect');

searchInput.addEventListener('input', (event) => {
  currentSearch = event.target.value;
  renderTasks(); // stats don't change from searching, only the visible list
});

filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    filterButtons.forEach((b) => b.classList.remove('is-active'));
    btn.classList.add('is-active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

sortSelect.addEventListener('change', (event) => {
  currentSort = event.target.value;
  renderTasks();
});

/* ------------------------------------------------------------------------
   10. EVENT DELEGATION FOR TASK CARDS
   Task cards are created and destroyed constantly (add / delete / filter /
   sort all re-render the list). Attaching a listener to every card would
   mean re-binding on every render and risking leaks. Instead we attach a
   single listener to the constant parent (#taskList) and use
   event.target.closest() to work out what was actually clicked — this is
   event delegation, and it keeps memory and setup cost constant no matter
   how many tasks exist.
   ------------------------------------------------------------------------ */
taskListEl.addEventListener('click', (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;

  const card = target.closest('.task-card');
  if (!card) return;
  const id = card.dataset.id;

  const action = target.dataset.action;
  if (action === 'edit') {
    openEditModal(id);
  } else if (action === 'delete') {
    openDeleteModal(id);
  }
});

// The checkbox fires a "change" event, not "click" reliably across browsers,
// so it gets its own delegated listener on the same shared parent.
taskListEl.addEventListener('change', (event) => {
  const target = event.target.closest('[data-action="toggle"]');
  if (!target) return;
  const card = target.closest('.task-card');
  if (!card) return;
  toggleTask(card.dataset.id);
});

/* ------------------------------------------------------------------------
   11. EDIT MODAL
   ------------------------------------------------------------------------ */
const editModalOverlay = document.getElementById('editModalOverlay');
const editForm = document.getElementById('editForm');
const editTaskIdInput = document.getElementById('editTaskId');
const editTitleInput = document.getElementById('editTitle');
const editDescriptionInput = document.getElementById('editDescription');
const editPriorityInput = document.getElementById('editPriority');
const editDueDateInput = document.getElementById('editDueDate');
const editTitleErrorEl = document.getElementById('editTitleError');
const editModalClose = document.getElementById('editModalClose');
const editCancelBtn = document.getElementById('editCancelBtn');

function openEditModal(id) {
  const task = tasks.find((t) => t.id === id);
  if (!task) return;

  editTaskIdInput.value = task.id;
  editTitleInput.value = task.title;
  editDescriptionInput.value = task.description;
  editPriorityInput.value = task.priority;
  editDueDateInput.value = task.dueDate;
  editTitleInput.classList.remove('has-error');
  editTitleErrorEl.textContent = '';

  editModalOverlay.hidden = false;
  editTitleInput.focus();
}

function closeEditModal() {
  editModalOverlay.hidden = true;
}

editForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const title = editTitleInput.value.trim();
  if (!title) {
    editTitleInput.classList.add('has-error');
    editTitleErrorEl.textContent = 'Please enter a task title.';
    editTitleInput.focus();
    return;
  }

  updateTask(editTaskIdInput.value, {
    title,
    description: editDescriptionInput.value.trim(),
    priority: editPriorityInput.value,
    dueDate: editDueDateInput.value,
  });

  closeEditModal();
});

editModalClose.addEventListener('click', closeEditModal);
editCancelBtn.addEventListener('click', closeEditModal);
editModalOverlay.addEventListener('click', (event) => {
  if (event.target === editModalOverlay) closeEditModal(); // click on the dim backdrop
});

/* ------------------------------------------------------------------------
   12. DELETE CONFIRMATION MODAL
   ------------------------------------------------------------------------ */
const deleteModalOverlay = document.getElementById('deleteModalOverlay');
const deleteCancelBtn = document.getElementById('deleteCancelBtn');
const deleteConfirmBtn = document.getElementById('deleteConfirmBtn');

function openDeleteModal(id) {
  taskPendingDeleteId = id;
  deleteModalOverlay.hidden = false;
  deleteConfirmBtn.focus();
}

function closeDeleteModal() {
  deleteModalOverlay.hidden = true;
  taskPendingDeleteId = null;
}

deleteCancelBtn.addEventListener('click', closeDeleteModal);
deleteModalOverlay.addEventListener('click', (event) => {
  if (event.target === deleteModalOverlay) closeDeleteModal();
});
deleteConfirmBtn.addEventListener('click', () => {
  if (taskPendingDeleteId) deleteTask(taskPendingDeleteId);
  closeDeleteModal();
});

// Escape key closes whichever modal is open
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!editModalOverlay.hidden) closeEditModal();
  if (!deleteModalOverlay.hidden) closeDeleteModal();
});

/* ------------------------------------------------------------------------
   13. TOAST FEEDBACK
   ------------------------------------------------------------------------ */
let toastTimer = null;
function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2200);
}

/* ------------------------------------------------------------------------
   14. INIT
   ------------------------------------------------------------------------ */
function init() {
  loadTasks();
  render();
}

init();
