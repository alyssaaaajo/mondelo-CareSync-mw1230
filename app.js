'use strict';
const kinds = ['patients', 'doctors', 'appointments'];
const state = { patients: [], doctors: [], appointments: [] };
const editing = { patients: null, doctors: null, appointments: null };
const configs = {
  patients: { form: 'patientForm', title: 'patientFormTitle', submit: 'patientSubmit', create: 'Add New Patient', action: 'Add Patient', update: 'Update Patient', columns: ['id', 'name', 'age', 'gender', 'contact', 'address'] },
  doctors: { form: 'doctorForm', title: 'doctorFormTitle', submit: 'doctorSubmit', create: 'Add New Doctor', action: 'Add Doctor', update: 'Update Doctor', columns: ['id', 'name', 'specialization', 'contact'] },
  appointments: { form: 'appointmentForm', title: 'appointmentFormTitle', submit: 'appointmentSubmit', create: 'Schedule New Appointment', action: 'Schedule Appointment', update: 'Update Appointment', columns: ['id', 'patient_name', 'doctor_name', 'appointment_date', 'appointment_time', 'reason', 'status'] }
};
const $ = id => document.getElementById(id);
const formOf = kind => $(configs[kind].form);

async function request(endpoint, options = {}) {
  let response;
  try { response = await fetch(endpoint, options); }
  catch { throw new Error('Cannot reach the server. Start Node.js and check your connection.'); }
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || `Request failed (${response.status}).`);
  return result;
}
function notify(message, error = false) {
  const box = $('notification');
  box.textContent = message;
  box.className = `notice ${error ? 'error' : 'success'}`;
  box.hidden = false;
}
function switchTab(kind) {
  kinds.forEach(name => {
    const section = $(name), active = name === kind;
    section.hidden = !active;
    section.classList.toggle('active', active);
  });
  document.querySelectorAll('[data-tab]').forEach(tab => {
    const active = tab.dataset.tab === kind;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-current', active ? 'page' : 'false');
  });
  $('notification').hidden = true;
}
function td(value) {
  const cell = document.createElement('td');
  cell.textContent = value == null || value === '' ? '—' : String(value);
  return cell;
}
function actionButton(label, klass, callback) {
  const button = document.createElement('button');
  button.className = `btn small ${klass}`;
  button.type = 'button';
  button.textContent = label;
  button.addEventListener('click', callback);
  return button;
}
function render(kind) {
  const config = configs[kind], tbody = $(`${kind}Body`);
  tbody.replaceChildren();
  if (!state[kind].length) {
    const row = document.createElement('tr'), cell = td('No records found. Add one above!');
    cell.className = 'empty';
    cell.colSpan = config.columns.length + 1;
    row.appendChild(cell); tbody.appendChild(row);
  }
  state[kind].forEach(record => {
    const row = document.createElement('tr');
    config.columns.forEach(key => {
      if (kind === 'appointments' && key === 'status') {
        const cell = document.createElement('td'), badge = document.createElement('span');
        badge.className = `status ${record.status}`;
        badge.textContent = record.status;
        cell.appendChild(badge); row.appendChild(cell);
      } else {
        let value = record[key];
        if (kind === 'appointments' && key === 'appointment_time') value = String(value || '').slice(0, 5);
        row.appendChild(td(value));
      }
    });
    const buttons = document.createElement('td');
    buttons.append(actionButton('Edit', 'edit', () => startEdit(kind, record.id)));
    buttons.append(actionButton('Delete', 'delete', () => remove(kind, record.id)));
    row.appendChild(buttons); tbody.appendChild(row);
  });
  $('patientCount').textContent = state.patients.length;
  $('doctorCount').textContent = state.doctors.length;
  $('appointmentCount').textContent = state.appointments.length;
}
function selectOptions(select, records, prefix) {
  const previous = select.value;
  select.replaceChildren(new Option(`Select ${prefix}`, ''));
  records.forEach(item => select.add(new Option(item.name, String(item.id))));
  select.value = previous;
}
function updateSelectors() {
  selectOptions($('appointmentPatient'), state.patients, 'patient');
  selectOptions($('appointmentDoctor'), state.doctors, 'doctor');
}
async function load(kind) {
  state[kind] = await request(`/api/${kind}`);
  render(kind);
  if (kind === 'patients' || kind === 'doctors') updateSelectors();
}
async function loadAll() {
  const results = await Promise.allSettled(kinds.map(load));
  const failed = results.find(item => item.status === 'rejected');
  if (failed) notify(failed.reason.message, true);
}
function reset(kind) {
  const config = configs[kind];
  editing[kind] = null;
  formOf(kind).reset();
  $(config.title).textContent = config.create;
  $(config.submit).textContent = config.action;
  document.querySelector(`[data-cancel="${kind}"]`).hidden = true;
}
function startEdit(kind, id) {
  const record = state[kind].find(item => item.id === id);
  if (!record) return notify('Record not found. Refresh the table.', true);
  const config = configs[kind], form = formOf(kind);
  Object.keys(record).forEach(key => {
    const input = form.elements.namedItem(key);
    if (!input) return;
    let value = record[key] ?? '';
    if (key === 'appointment_time') value = String(value).slice(0, 5);
    input.value = value;
  });
  editing[kind] = id;
  $(config.title).textContent = kind === 'appointments' ? 'Edit Appointment' : `Edit ${kind === 'patients' ? 'Patient' : 'Doctor'}`;
  $(config.submit).textContent = config.update;
  document.querySelector(`[data-cancel="${kind}"]`).hidden = false;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
async function submit(kind, event) {
  event.preventDefault();
  const form = formOf(kind), id = editing[kind];
  const body = Object.fromEntries(new FormData(form).entries());
  const button = $(configs[kind].submit);
  button.disabled = true;
  try {
    await request(`/api/${kind}${id === null ? '' : `/${id}`}`, {
      method: id === null ? 'POST' : 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    reset(kind);
    await load(kind);
    if (kind !== 'appointments') await load('appointments');
    notify(`${kind === 'appointments' ? 'Appointment' : kind === 'patients' ? 'Patient' : 'Doctor'} ${id === null ? 'added' : 'updated'} successfully.`);
  } catch (error) { notify(error.message, true); }
  finally { button.disabled = false; }
}
async function remove(kind, id) {
  if (!confirm(`Are you sure you want to delete this ${kind.slice(0, -1)}?`)) return;
  try {
    await request(`/api/${kind}/${id}`, { method: 'DELETE' });
    if (editing[kind] === id) reset(kind);
    await load(kind);
    if (kind !== 'appointments') await load('appointments');
    notify('Record deleted successfully.');
  } catch (error) { notify(error.message, true); }
}

document.querySelectorAll('[data-tab]').forEach(tab => tab.addEventListener('click', () => switchTab(tab.dataset.tab)));
document.querySelectorAll('[data-refresh]').forEach(button => button.addEventListener('click', async () => {
  try { await load(button.dataset.refresh); notify('Records refreshed successfully.'); }
  catch (error) { notify(error.message, true); }
}));
document.querySelectorAll('[data-cancel]').forEach(button => button.addEventListener('click', () => reset(button.dataset.cancel)));
kinds.forEach(kind => formOf(kind).addEventListener('submit', event => submit(kind, event)));
loadAll();
