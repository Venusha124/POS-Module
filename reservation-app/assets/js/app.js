/* ==========================================================================
   IMPERIAL RESERVATIONS — Main Application Logic (Full DB Sync)
   ========================================================================== */

const $ = id => document.getElementById(id);
const sym = () => store.data.settings.currency_symbol || 'Rs.';

// ─── Toast ───────────────────────────────────────────────────────────────────
function showToast(msg, type = 'info') {
    const toast = $('toast');
    const icons  = { success: 'fa-circle-check', danger: 'fa-circle-xmark', info: 'fa-circle-info', warning: 'fa-triangle-exclamation' };
    const colors = { success: '#10b981', danger: '#ef4444', info: '#00f2fe', warning: '#f59e0b' };
    toast.innerHTML = `<i class="fa-solid ${icons[type]}" style="color:${colors[type]};margin-right:10px;"></i>${msg}`;
    toast.style.display = 'block';
    clearTimeout(window._toastTimer);
    window._toastTimer = setTimeout(() => toast.style.display = 'none', 3500);
}

// ─── Modals ──────────────────────────────────────────────────────────────────
function openModal(id)  { $(id).classList.add('open'); }
function closeModal(id) { $(id).classList.remove('open'); }

// ─── Helpers ─────────────────────────────────────────────────────────────────
function statusBadge(status) {
    const map = {
        Confirmed: 'badge-success', Pending: 'badge-warning', Cancelled: 'badge-danger',
        Available: 'badge-success', Booked: 'badge-info', Maintenance: 'badge-danger'
    };
    const dot = { Confirmed: '🟢', Pending: '🟡', Cancelled: '🔴', Available: '🟢', Booked: '🔵', Maintenance: '🔴' };
    return `<span class="badge ${map[status] || 'badge-info'}">${status}</span>`;
}

function formatDate(d) {
    if (!d) return '—';
    return new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(v) {
    return `${sym()}${parseFloat(v || 0).toLocaleString()}`;
}

// ─── Router ──────────────────────────────────────────────────────────────────
const routes = {
    '/dashboard': renderDashboard,
    '/customers': renderCustomers,
    '/inquiry':   renderInquiry,
    '/booking':   renderBooking,
    '/events':    renderEvents,
    '/rooms':     renderRooms,
    '/agreement': renderAgreement,
    '/approval':  renderApproval,
    '/calendar':  renderCalendar,
    '/reports':   renderReports,
    '/settings':  renderSettings
};

let currentRoute = '/dashboard';

function navigate(route) {
    if (!routes[route]) route = '/dashboard';
    currentRoute = route;
    document.querySelectorAll('.nav-item[data-route]').forEach(el =>
        el.classList.toggle('active', el.getAttribute('data-route') === route)
    );
    const view = $('app-view');
    view.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'page-enter';
    view.appendChild(wrapper);
    routes[route](wrapper);
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    await store.init();

    window.addEventListener('hashchange', () => navigate(window.location.hash.slice(1) || '/dashboard'));

    $('refreshBtn').addEventListener('click', async () => {
        const icon = $('refreshBtn').querySelector('i');
        icon.style.transition = 'transform 0.5s';
        icon.style.transform = 'rotate(360deg)';
        setTimeout(() => { icon.style.transform = ''; }, 500);
        await store.refreshData();
        showToast('Data refreshed from database', 'success');
    });

    $('globalSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase().trim();
        if (q.length < 2) return;
        const r = store.data.reservations.filter(r =>
            (r.event_name || '').toLowerCase().includes(q) ||
            (r.customer_name || '').toLowerCase().includes(q) ||
            (r.customer_phone || '').toLowerCase().includes(q)
        );
        const c = store.data.customers.filter(cu =>
            (cu.name || '').toLowerCase().includes(q) ||
            (cu.phone || '').toLowerCase().includes(q)
        );
        if (r.length || c.length)
            showToast(`Found: ${r.length} reservation(s), ${c.length} customer(s)`, 'info');
    });

    navigate(window.location.hash.slice(1) || '/dashboard');
});

// ═══════════════════════════════════════════════════════════════════════════════
// RESERVATION MODAL
// ═══════════════════════════════════════════════════════════════════════════════
let _editingReservationId = null;

function openReservationModal(prefill = null) {
    _editingReservationId = prefill ? prefill.id : null;
    const sel = $('res_room_id');
    sel.innerHTML = `<option value="">-- No Venue --</option>` +
        store.data.eventRooms.map(r =>
            `<option value="${r.id}" ${prefill && prefill.room_id == r.id ? 'selected' : ''}>${r.name} (${sym()}${r.price_per_day}/day · Cap:${r.capacity})</option>`
        ).join('');

    const fields = ['res_event_name','res_customer_name','res_customer_phone','res_date_start','res_date_end','res_num_guests','res_total_price'];
    const values = prefill
        ? [prefill.event_name, prefill.customer_name, prefill.customer_phone,
           prefill.date_start ? prefill.date_start.split('T')[0] : '',
           prefill.date_end   ? prefill.date_end.split('T')[0] : '',
           prefill.num_guests, prefill.total_price]
        : ['','','','','','',''];
    fields.forEach((id, i) => $(id).value = values[i] || '');
    if (prefill) $('res_status').value = prefill.status || 'Pending';

    $('reservationModal').querySelector('h3').innerHTML =
        `<i class="fa-solid fa-calendar-check" style="color:var(--primary);margin-right:10px;"></i>${_editingReservationId ? 'Edit Reservation' : 'New Reservation'}`;

    openModal('reservationModal');
}

async function submitReservation() {
    const body = {
        event_name:      $('res_event_name').value.trim(),
        customer_name:   $('res_customer_name').value.trim(),
        customer_phone:  $('res_customer_phone').value.trim(),
        room_id:         $('res_room_id').value || null,
        date_start:      $('res_date_start').value,
        date_end:        $('res_date_end').value,
        num_guests:      $('res_num_guests').value,
        status:          $('res_status').value,
        total_price:     $('res_total_price').value
    };
    
    // Front-end Validations
    if (!body.event_name) { showToast('Event name is required', 'warning'); return; }
    if (!body.customer_name) { showToast('Customer name is required', 'warning'); return; }
    if (!body.customer_phone) { showToast('Customer phone is required', 'warning'); return; }
    if (body.customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(body.customer_phone)) { showToast('Invalid phone number format', 'warning'); return; }
    if (!body.date_start) { showToast('Start date is required', 'warning'); return; }
    if (body.date_end && new Date(body.date_start) > new Date(body.date_end)) { showToast('End date cannot be before start date', 'warning'); return; }
    if (body.num_guests && body.num_guests < 1) { showToast('Number of guests must be at least 1', 'warning'); return; }
    if (body.total_price && body.total_price < 0) { showToast('Total price cannot be negative', 'warning'); return; }

    const overlaps = checkOverlap(body.room_id, body.date_start, body.date_end, _editingReservationId);
    if (overlaps && body.status === 'Confirmed') {
        if (confirm('⚠️ VENUE OVERLAP CONFLICT!\n\nThis room/venue is already booked for the selected dates. Would you like to add the customer to the Waitlist queue instead?')) {
            try {
                await store.fetchAPI('/waitlist', {
                    method: 'POST',
                    body: JSON.stringify({
                        room_id: body.room_id,
                        customer_name: body.customer_name,
                        customer_phone: body.customer_phone,
                        date_start: body.date_start,
                        date_end: body.date_end,
                        num_guests: body.num_guests,
                        event_name: body.event_name,
                        notes: body.notes || ''
                    })
                });
                await store.refreshData();
                showToast('Customer added to the Waitlist queue ✓', 'success');
                closeModal('reservationModal');
            } catch (err) {
                showToast('Failed to add to Waitlist: ' + err.message, 'danger');
            }
        }
        return;
    }

    try {
        if (_editingReservationId) {
            await store.fetchAPI(`/reservations/${_editingReservationId}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Reservation updated in database ✓', 'success');
        } else {
            await store.fetchAPI('/reservations', { method: 'POST', body: JSON.stringify(body) });
            showToast('Reservation saved to database ✓', 'success');
        }
        closeModal('reservationModal');
        await store.refreshData();
    } catch (e) { showToast('Database error: ' + e.message, 'danger'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// STATUS UPDATE (Confirm / Cancel)
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// INQUIRY WIZARD MODAL
// ═══════════════════════════════════════════════════════════════════════════════

let _inqStep = 1;
let _editingInquiryId = null;

function openInquiryModal(inq = null) {
    _editingInquiryId = inq ? inq.id : null;
    _inqStep = 1;

    // Populate room dropdown
    const sel = $('inq_room_id');
    sel.innerHTML = `<option value="">-- No Preference --</option>` +
        store.data.eventRooms.map(r => `<option value="${r.id}" ${inq && inq.preferred_room_id == r.id ? 'selected' : ''}>${r.name} (Cap: ${r.capacity})</option>`).join('');

    // Clear or prefill
    const fields = {
        inq_customer_name:  inq ? inq.customer_name  : '',
        inq_customer_phone: inq ? inq.customer_phone : '',
        inq_customer_email: inq ? inq.customer_email : '',
        inq_assigned_to:    inq ? inq.assigned_to    : '',
        inq_preferred_date: inq && inq.preferred_date ? inq.preferred_date.split('T')[0] : '',
        inq_num_guests:     inq ? inq.num_guests     : '',
        inq_budget:         inq ? inq.budget         : '',
        inq_follow_up_date: inq && inq.follow_up_date ? inq.follow_up_date.split('T')[0] : '',
        inq_requirements:   inq ? inq.requirements   : '',
        inq_notes:          inq ? inq.notes          : ''
    };
    Object.entries(fields).forEach(([id, val]) => { if ($(id)) $(id).value = val || ''; });

    if (inq) {
        if ($('inq_source'))        $('inq_source').value      = inq.source     || 'Walk-in';
        if ($('inq_event_type'))    $('inq_event_type').value  = inq.event_type || 'Wedding';
        if ($('inq_flexible_date')) $('inq_flexible_date').checked = !!inq.flexible_date;
    }

    $('inquiryModalTitle').innerHTML = `<i class="fa-solid fa-clipboard-question" style="color:var(--primary);margin-right:10px;"></i>${_editingInquiryId ? 'Edit Inquiry' : 'New Inquiry'}`;
    _inqGoToStep(1);
    openModal('inquiryModal');
}

function _inqGoToStep(step) {
    _inqStep = step;
    [1,2,3].forEach(s => {
        const el = $(`inq-step-${s}`);
        if (el) el.style.display = s === step ? '' : 'none';
        const dot = $(`step-dot-${s}`);
        if (dot) {
            dot.className = `inq-step ${s < step ? 'done' : s === step ? 'active' : ''}`;
            dot.innerHTML = s < step ? '<i class="fa-solid fa-check" style="font-size:12px;"></i>' : s;
        }
    });
    // Update lines
    document.querySelectorAll('.inq-step-line').forEach((line, i) => {
        line.className = `inq-step-line ${i < step - 1 ? 'done' : ''}`;
    });

    $('inqPrevBtn').style.display  = step > 1 ? '' : 'none';
    $('inqNextBtn').style.display  = step < 3 ? '' : 'none';
    $('inqSubmitBtn').style.display = step === 3 ? '' : 'none';
}

function inqNext() {
    if (_inqStep === 1) {
        if (!$('inq_customer_name').value.trim()) { showToast('Customer name is required', 'warning'); return; }
        const phone = $('inq_customer_phone').value.trim();
        const email = $('inq_customer_email').value.trim();
        if (!phone && !email) { showToast('At least one contact method (phone or email) is required', 'warning'); return; }
        if (phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(phone)) { showToast('Invalid phone number format', 'warning'); return; }
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showToast('Invalid email address format', 'warning'); return; }
    }
    if (_inqStep === 2) {
        const budget = $('inq_budget').value;
        const guests = $('inq_num_guests').value;
        if (budget && budget < 0) { showToast('Budget cannot be negative', 'warning'); return; }
        if (guests && guests < 1) { showToast('Number of guests must be at least 1', 'warning'); return; }
    }
    if (_inqStep < 3) _inqGoToStep(_inqStep + 1);
}

function inqPrev() {
    if (_inqStep > 1) _inqGoToStep(_inqStep - 1);
}

async function submitInquiry() {
    const body = {
        customer_name:    $('inq_customer_name').value.trim(),
        customer_phone:   $('inq_customer_phone').value.trim(),
        customer_email:   $('inq_customer_email').value.trim(),
        event_type:       $('inq_event_type').value,
        preferred_date:   $('inq_preferred_date').value,
        flexible_date:    $('inq_flexible_date').checked ? 1 : 0,
        num_guests:       $('inq_num_guests').value,
        preferred_room_id: $('inq_room_id').value || null,
        budget:           $('inq_budget').value,
        requirements:     $('inq_requirements').value.trim(),
        source:           $('inq_source').value,
        assigned_to:      $('inq_assigned_to').value.trim(),
        follow_up_date:   $('inq_follow_up_date').value,
        notes:            $('inq_notes').value.trim()
    };
    
    // Front-end Validations
    if (!body.customer_name) { showToast('Customer name is required', 'warning'); return; }
    if (!body.customer_phone && !body.customer_email) { showToast('At least one contact method is required', 'warning'); return; }
    if (body.customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(body.customer_phone)) { showToast('Invalid phone format', 'warning'); return; }
    if (body.customer_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.customer_email)) { showToast('Invalid email format', 'warning'); return; }
    if (body.budget && body.budget < 0) { showToast('Budget cannot be negative', 'warning'); return; }
    if (body.num_guests && body.num_guests < 1) { showToast('Guests must be at least 1', 'warning'); return; }

    try {
        if (_editingInquiryId) {
            await store.fetchAPI(`/inquiries/${_editingInquiryId}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Inquiry updated in database ✓', 'success');
        } else {
            await store.fetchAPI('/inquiries', { method: 'POST', body: JSON.stringify(body) });
            showToast('Inquiry saved to database ✓', 'success');
        }
        closeModal('inquiryModal');
        await store.refreshData();
    } catch(e) { showToast('Database error: ' + e.message, 'danger'); }
}

async function updateInquiryStatus(id, status) {
    try {
        await store.fetchAPI(`/inquiries/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
        await store.refreshData();
        showToast(`Status updated to "${status}" ✓`, 'success');
    } catch(e) { showToast('Failed to update: ' + e.message, 'danger'); }
}

async function convertInquiry(id) {
    if (!confirm('Convert this inquiry to a Reservation? A new pending reservation will be created.')) return;
    try {
        const data = await store.fetchAPI(`/inquiries/${id}/convert`, { method: 'POST' }).then(r => r.json());
        await store.refreshData();
        showToast(`Converted! Reservation #${data.reservation_id} created ✓`, 'success');
    } catch(e) { showToast('Conversion failed: ' + e.message, 'danger'); }
}

async function deleteInquiry(id) {
    if (!confirm('Permanently delete this inquiry?')) return;
    try {
        await store.fetchAPI(`/inquiries/${id}`, { method: 'DELETE' });
        await store.refreshData();
        showToast('Inquiry deleted ✓', 'success');
    } catch(e) { showToast('Failed to delete: ' + e.message, 'danger'); }
}

function viewInquiryDetail(inq) {
    const sourceClass = (inq.source || 'Walk-in').replace(' ', '');
    $('inquiryDetailBody').innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;">
            <div>
                <div class="inq-ref" style="margin-bottom:4px;">${inq.ref_no}</div>
                <h3 style="font-size:20px;font-weight:800;">${inq.customer_name}</h3>
                <div style="color:var(--text-muted);font-size:13px;margin-top:4px;">${inq.customer_phone || ''} ${inq.customer_email ? '· ' + inq.customer_email : ''}</div>
            </div>
            ${statusBadge(inq.status)}
        </div>

        <div class="detail-grid">
            <div class="detail-item"><label>Event Type</label><div class="detail-value">${inq.event_type || '—'}</div></div>
            <div class="detail-item"><label>Preferred Venue</label><div class="detail-value">${inq.room_name || '—'}</div></div>
            <div class="detail-item"><label>Preferred Date</label><div class="detail-value">${formatDate(inq.preferred_date)}${inq.flexible_date ? ' <span style="color:var(--primary);font-size:11px;">(Flexible)</span>' : ''}</div></div>
            <div class="detail-item"><label>No. of Guests</label><div class="detail-value">${inq.num_guests || '—'}</div></div>
            <div class="detail-item"><label>Budget</label><div class="detail-value" style="color:var(--primary);font-weight:800;">${formatCurrency(inq.budget)}</div></div>
            <div class="detail-item"><label>Source</label><div class="detail-value"><span class="source-badge source-${sourceClass}">${inq.source || '—'}</span></div></div>
            <div class="detail-item"><label>Assigned To</label><div class="detail-value">${inq.assigned_to || '—'}</div></div>
            <div class="detail-item"><label>Follow-up Date</label><div class="detail-value" style="${inq.follow_up_date && new Date(inq.follow_up_date) < new Date() ? 'color:#ef4444;' : ''}">${formatDate(inq.follow_up_date)}</div></div>
        </div>

        ${inq.requirements ? `
        <div style="margin-bottom:16px;">
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Requirements</label>
            <div style="margin-top:6px;padding:12px;background:rgba(255,255,255,0.04);border-radius:10px;font-size:14px;line-height:1.6;">${inq.requirements}</div>
        </div>` : ''}

        ${inq.notes ? `
        <div style="margin-bottom:20px;">
            <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;">Internal Notes</label>
            <div style="margin-top:6px;padding:12px;background:rgba(245,158,11,0.05);border:1px solid rgba(245,158,11,0.15);border-radius:10px;font-size:14px;line-height:1.6;">${inq.notes}</div>
        </div>` : ''}

        <div style="display:flex;gap:8px;flex-wrap:wrap;">
            ${inq.status !== 'Converted' ? `
            <button class="btn btn-primary btn-sm" onclick="closeModal('inquiryDetailModal'); convertInquiry(${inq.id})">
                <i class="fa-solid fa-arrow-right-arrow-left" style="margin-right:6px;"></i>Convert to Booking
            </button>` : ''}
            <button class="btn btn-outline btn-sm" onclick="closeModal('inquiryDetailModal'); openInquiryModal(${JSON.stringify(inq).replace(/"/g,'&quot;')})">
                <i class="fa-solid fa-pen" style="margin-right:6px;"></i>Edit
            </button>
            ${inq.status === 'New' ? `<button class="btn btn-outline btn-sm" onclick="updateInquiryStatus(${inq.id},'In Progress'); closeModal('inquiryDetailModal')">Mark In Progress</button>` : ''}
            ${inq.status === 'In Progress' ? `<button class="btn btn-outline btn-sm" onclick="updateInquiryStatus(${inq.id},'Quoted'); closeModal('inquiryDetailModal')">Mark Quoted</button>` : ''}
            <button class="btn btn-danger btn-sm" onclick="closeModal('inquiryDetailModal'); deleteInquiry(${inq.id})">
                <i class="fa-solid fa-trash"></i>
            </button>
        </div>`;
    openModal('inquiryDetailModal');
}

// ─── Active filter state ──────────────────────────────────────────────────────
let _inquiryFilter = 'All';

function renderInquiry(c) {
    const all = store.data.inquiries;
    const statusCounts = { All: all.length, New: 0, 'In Progress': 0, Quoted: 0, Converted: 0, Rejected: 0 };
    all.forEach(i => { if (statusCounts[i.status] !== undefined) statusCounts[i.status]++; });

    const filtered = _inquiryFilter === 'All' ? all : all.filter(i => i.status === _inquiryFilter);

    const converted   = statusCounts.Converted;
    const convRate    = all.length ? Math.round(converted / all.length * 100) : 0;
    const overdue     = all.filter(i => i.follow_up_date && new Date(i.follow_up_date) < new Date() && i.status !== 'Converted' && i.status !== 'Rejected').length;

    const sourceIcons = { 'Walk-in': 'fa-person-walking', 'Phone Call': 'fa-phone', 'Email': 'fa-envelope', 'Social Media': 'fa-hashtag', 'Website': 'fa-globe', 'Referral': 'fa-people-arrows' };

    c.innerHTML = `
    <!-- Stats Row -->
    <div class="stats-grid" style="grid-template-columns:repeat(5,1fr);margin-bottom:24px;">
        <div class="stat-card" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div class="stat-icon" style="background:rgba(0,242,254,0.15);"><i class="fa-solid fa-clipboard-list" style="color:#00f2fe;"></i></div>
            <div><div class="stat-value">${all.length}</div><div class="stat-label">Total Inquiries</div></div>
        </div>
        <div class="stat-card" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div class="stat-icon" style="background:rgba(0,242,254,0.1);"><i class="fa-solid fa-envelope-open" style="color:#00f2fe;"></i></div>
            <div><div class="stat-value">${statusCounts.New}</div><div class="stat-label">New</div></div>
        </div>
        <div class="stat-card" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div class="stat-icon" style="background:rgba(245,158,11,0.15);"><i class="fa-solid fa-spinner" style="color:#f59e0b;"></i></div>
            <div><div class="stat-value">${statusCounts['In Progress']}</div><div class="stat-label">In Progress</div></div>
        </div>
        <div class="stat-card" style="flex-direction:column;align-items:flex-start;gap:8px;">
            <div class="stat-icon" style="background:rgba(16,185,129,0.15);"><i class="fa-solid fa-arrow-right-arrow-left" style="color:#10b981;"></i></div>
            <div><div class="stat-value">${converted}</div><div class="stat-label">Converted</div>
                <div class="conversion-bar" style="width:80px;"><div class="conversion-fill" style="width:${convRate}%;"></div></div>
                <div style="font-size:11px;color:var(--primary);margin-top:3px;">${convRate}% rate</div>
            </div>
        </div>
        <div class="stat-card" style="flex-direction:column;align-items:flex-start;gap:8px;${overdue ? 'border-color:rgba(239,68,68,0.4);' : ''}">
            <div class="stat-icon" style="background:rgba(239,68,68,0.15);"><i class="fa-solid fa-bell" style="color:#ef4444;"></i></div>
            <div><div class="stat-value" style="${overdue ? 'color:#ef4444;' : ''}">${overdue}</div><div class="stat-label">Overdue Follow-ups</div></div>
        </div>
    </div>

    <div class="card">
        <!-- Header -->
        <div class="section-header" style="margin-bottom:20px;">
            <div>
                <h2><i class="fa-solid fa-clipboard-question" style="color:var(--primary);margin-right:10px;"></i>Inquiry Management</h2>
                <p>${filtered.length} of ${all.length} inquiries shown</p>
            </div>
            <button class="btn btn-primary" onclick="openInquiryModal()">
                <i class="fa-solid fa-plus" style="margin-right:8px;"></i>New Inquiry
            </button>
        </div>

        <!-- Filter Tabs -->
        <div class="filter-tabs" style="margin-bottom:24px;" id="inqFilterTabs">
            ${Object.entries(statusCounts).map(([status, count]) => `
                <button class="filter-tab ${_inquiryFilter === status ? 'active' : ''}"
                    onclick="_inquiryFilter='${status}'; navigate('/inquiry');">
                    ${status} <span style="font-size:11px;opacity:0.8;">(${count})</span>
                </button>
            `).join('')}
        </div>

        <!-- Inquiry Cards Grid -->
        ${filtered.length === 0 ? `
            <div class="empty-state">
                <i class="fa-solid fa-inbox"></i>
                <h3>No Inquiries Found</h3>
                <p>No inquiries match the selected filter. Click "New Inquiry" to add one.</p>
            </div>` : `
        <div class="inq-kanban">
            ${filtered.map(inq => {
                const srcClass = (inq.source || 'Walk-in').replace(' ', '');
                const isOverdue = inq.follow_up_date && new Date(inq.follow_up_date) < new Date() && inq.status !== 'Converted' && inq.status !== 'Rejected';
                const statusClass = inq.status.replace(' ', '-');
                return `
                <div class="inq-card status-${statusClass}" onclick="viewInquiryDetail(${JSON.stringify(inq).replace(/'/g,'&#39;').replace(/"/g,'&quot;')})">
                    <div class="inq-card-header">
                        <div>
                            <div class="inq-ref">${inq.ref_no || '—'}</div>
                        </div>
                        ${statusBadge(inq.status)}
                    </div>

                    <div class="inq-name">${inq.customer_name}</div>
                    <div class="inq-contact">
                        ${inq.customer_phone ? `<i class="fa-solid fa-phone" style="font-size:11px;margin-right:5px;color:var(--primary);"></i>${inq.customer_phone}` : ''}
                        ${inq.customer_email ? `<br><i class="fa-solid fa-envelope" style="font-size:11px;margin-right:5px;color:var(--primary);"></i>${inq.customer_email}` : ''}
                    </div>

                    <div class="inq-meta">
                        ${inq.event_type ? `<div class="inq-meta-item"><i class="fa-solid fa-champagne-glasses"></i>${inq.event_type}</div>` : ''}
                        ${inq.num_guests  ? `<div class="inq-meta-item"><i class="fa-solid fa-users"></i>${inq.num_guests} guests</div>` : ''}
                        ${inq.preferred_date ? `<div class="inq-meta-item"><i class="fa-regular fa-calendar"></i>${formatDate(inq.preferred_date)}${inq.flexible_date ? ' ±' : ''}</div>` : ''}
                        ${inq.budget ? `<div class="inq-meta-item"><i class="fa-solid fa-coins"></i>${formatCurrency(inq.budget)}</div>` : ''}
                        ${inq.room_name ? `<div class="inq-meta-item"><i class="fa-solid fa-door-open"></i>${inq.room_name}</div>` : ''}
                    </div>

                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="source-badge source-${srcClass}"><i class="fa-solid ${sourceIcons[inq.source] || 'fa-circle-dot'}"></i>${inq.source || 'Walk-in'}</span>
                        ${inq.follow_up_date ? `<span style="font-size:11px;${isOverdue ? 'color:#ef4444;font-weight:700;' : 'color:var(--text-muted);'}">
                            <i class="fa-solid fa-bell" style="margin-right:4px;"></i>Follow-up: ${formatDate(inq.follow_up_date)}
                            ${isOverdue ? '<span style="background:rgba(239,68,68,0.2);padding:2px 6px;border-radius:6px;margin-left:4px;">OVERDUE</span>' : ''}
                        </span>` : ''}
                    </div>

                    ${inq.assigned_to ? `<div style="font-size:12px;color:var(--text-muted);margin-top:8px;"><i class="fa-solid fa-user-tie" style="color:var(--primary);margin-right:5px;"></i>Assigned: ${inq.assigned_to}</div>` : ''}

                    <div class="inq-card-actions" onclick="event.stopPropagation();">
                        ${inq.status === 'New' ? `
                            <button class="btn btn-outline btn-sm" onclick="updateInquiryStatus(${inq.id},'In Progress')" title="Mark In Progress">
                                <i class="fa-solid fa-play"></i>
                            </button>` : ''}
                        ${inq.status === 'In Progress' ? `
                            <button class="btn btn-outline btn-sm" onclick="updateInquiryStatus(${inq.id},'Quoted')" title="Mark Quoted" style="border-color:#8b5cf6;color:#8b5cf6;">
                                <i class="fa-solid fa-file-invoice-dollar"></i>
                            </button>` : ''}
                        ${inq.status !== 'Converted' && inq.status !== 'Rejected' ? `
                            <button class="btn btn-primary btn-sm" onclick="convertInquiry(${inq.id})" title="Convert to Booking" style="flex:1;justify-content:center;">
                                <i class="fa-solid fa-arrow-right-arrow-left" style="margin-right:6px;"></i>Convert
                            </button>` : ''}
                        <button class="btn btn-outline btn-sm" onclick='openInquiryModal(${JSON.stringify(inq).replace(/'/g,"&#39;")})' title="Edit">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteInquiry(${inq.id})" title="Delete">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`;
            }).join('')}
        </div>`}
    </div>

    <!-- Source Breakdown -->
    <div class="card" style="margin-top:24px;">
        <h3 style="margin-bottom:20px;"><i class="fa-solid fa-chart-pie" style="color:var(--primary);margin-right:10px;"></i>Inquiry Sources</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:16px;">
            ${Object.entries(
                all.reduce((acc, i) => { const s = i.source||'Walk-in'; acc[s] = (acc[s]||0)+1; return acc; }, {})
            ).sort((a,b) => b[1]-a[1]).map(([src, cnt]) => {
                const srcClass = src.replace(' ', '');
                const icon = sourceIcons[src] || 'fa-circle-dot';
                return `<div style="text-align:center;padding:16px;border:1px solid var(--glass-border);border-radius:16px;">
                    <i class="fa-solid ${icon}" style="font-size:24px;margin-bottom:8px;display:block;color:var(--primary);"></i>
                    <div style="font-size:22px;font-weight:800;">${cnt}</div>
                    <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">${src}</div>
                </div>`;
            }).join('')}
        </div>
    </div>`;
}


function checkOverlap(roomId, dateStart, dateEnd, excludeResId = null) {
    if (!roomId || !dateStart) return false;
    const start = new Date(dateStart);
    const end = dateEnd ? new Date(dateEnd) : start;
    
    return store.data.reservations.some(r => {
        if (r.room_id != roomId) return false;
        if (r.status !== 'Confirmed') return false;
        if (excludeResId && r.id == excludeResId) return false;
        
        const rStart = new Date(r.date_start);
        const rEnd = r.date_end ? new Date(r.date_end) : rStart;
        
        return start <= rEnd && end >= rStart;
    });
}

async function deleteWaitlistEntry(id) {
    if (!confirm('Remove this customer from the waitlist queue?')) return;
    try {
        await store.fetchAPI(`/waitlist/${id}`, { method: 'DELETE' });
        await store.refreshData();
        showToast('Waitlist entry removed ✓', 'success');
    } catch (err) {
        showToast('Failed to remove waitlist entry: ' + err.message, 'danger');
    }
}

async function updateReservationStatus(id, status) {
    try {
        const response = await store.fetchAPI(`/reservations/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }).then(r => r.json());
        await store.refreshData();
        showToast(`Reservation ${status} — database updated ✓`, 'success');
        if (response.promoted) {
            setTimeout(() => {
                alert(`🎉 WAITLIST PROMOTION:\n\nCustomer "${response.promoted.customer_name}" has been automatically promoted to a Pending booking for Room/Venue!`);
            }, 500);
        }
    } catch(e) { showToast('Failed to update status: ' + e.message, 'danger'); }
}

async function deleteReservation(id) {
    if (!confirm('Permanently delete this reservation?')) return;
    try {
        const response = await store.fetchAPI(`/reservations/${id}`, { method: 'DELETE' }).then(r => r.json());
        await store.refreshData();
        showToast('Reservation deleted from database ✓', 'success');
        if (response.promoted) {
            setTimeout(() => {
                alert(`🎉 WAITLIST PROMOTION:\n\nCustomer "${response.promoted.customer_name}" has been automatically promoted to a Pending booking for Room/Venue!`);
            }, 500);
        }
    } catch(e) { showToast('Failed to delete: ' + e.message, 'danger'); }
}


// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMER MODAL
// ═══════════════════════════════════════════════════════════════════════════════
let _editingCustomerId = null;

function openCustomerModal(customer = null) {
    _editingCustomerId = customer ? customer.id : null;
    $('cust_name').value  = customer ? customer.name  : '';
    $('cust_phone').value = customer ? customer.phone : '';
    $('cust_email').value = customer ? customer.email : '';
    $('customerModal').querySelector('h3').innerHTML =
        `<i class="fa-solid fa-user-plus" style="color:var(--primary);margin-right:10px;"></i>${_editingCustomerId ? 'Edit Customer' : 'Register Customer'}`;
    openModal('customerModal');
}

async function submitCustomer() {
    const body = {
        name:  $('cust_name').value.trim(),
        phone: $('cust_phone').value.trim(),
        email: $('cust_email').value.trim()
    };
    
    if (!body.name) { showToast('Customer name is required', 'warning'); return; }
    if (!body.phone) { showToast('Phone number is required', 'warning'); return; }
    if (body.phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(body.phone)) { showToast('Invalid phone number format', 'warning'); return; }
    if (body.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) { showToast('Invalid email format', 'warning'); return; }

    try {
        if (_editingCustomerId) {
            await store.fetchAPI(`/customers/${_editingCustomerId}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Customer updated in database ✓', 'success');
        } else {
            await store.fetchAPI('/customers', { method: 'POST', body: JSON.stringify(body) });
            showToast('Customer registered in database ✓', 'success');
        }
        closeModal('customerModal');
        await store.refreshData();
    } catch(e) { showToast('Database error: ' + e.message, 'danger'); }
}

async function deleteCustomer(id) {
    if (!confirm('Delete this customer? This cannot be undone.')) return;
    try {
        await store.fetchAPI(`/customers/${id}`, { method: 'DELETE' });
        await store.refreshData();
        showToast('Customer deleted from database ✓', 'success');
    } catch(e) { showToast('Failed to delete: ' + e.message, 'danger'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOM MODAL
// ═══════════════════════════════════════════════════════════════════════════════
let _editingRoomId = null;

function openRoomModal(room = null) {
    _editingRoomId = room ? room.id : null;
    $('room_name').value     = room ? room.name          : '';
    $('room_capacity').value = room ? room.capacity      : '';
    $('room_price').value    = room ? room.price_per_day : '';
    $('room_type').value     = room ? room.type          : 'Banquet';
    $('room_status').value   = room ? room.status        : 'Available';
    $('roomModal').querySelector('h3').innerHTML =
        `<i class="fa-solid fa-door-open" style="color:var(--primary);margin-right:10px;"></i>${_editingRoomId ? 'Edit Venue' : 'Add Venue'}`;
    openModal('roomModal');
}

async function submitRoom() {
    const body = {
        name:          $('room_name').value.trim(),
        capacity:      parseInt($('room_capacity').value),
        price_per_day: parseFloat($('room_price').value),
        type:          $('room_type').value,
        status:        $('room_status').value
    };
    
    if (!body.name) { showToast('Venue name is required', 'warning'); return; }
    if (isNaN(body.capacity) || body.capacity < 1) { showToast('Capacity must be a valid number > 0', 'warning'); return; }
    if (isNaN(body.price_per_day) || body.price_per_day < 0) { showToast('Price must be a valid positive number', 'warning'); return; }

    try {
        if (_editingRoomId) {
            await store.fetchAPI(`/event-rooms/${_editingRoomId}`, { method: 'PUT', body: JSON.stringify(body) });
            showToast('Venue updated in database ✓', 'success');
        } else {
            await store.fetchAPI('/event-rooms', { method: 'POST', body: JSON.stringify(body) });
            showToast('Venue saved to database ✓', 'success');
        }
        closeModal('roomModal');
        await store.refreshData();
    } catch(e) { showToast('Database error: ' + e.message, 'danger'); }
}

async function deleteRoom(id) {
    if (!confirm('Delete this venue?')) return;
    try {
        await store.fetchAPI(`/event-rooms/${id}`, { method: 'DELETE' });
        await store.refreshData();
        showToast('Venue deleted from database ✓', 'success');
    } catch(e) { showToast('Failed to delete: ' + e.message, 'danger'); }
}

// ═══════════════════════════════════════════════════════════════════════════════
// BOOKING INLINE FORM
// ═══════════════════════════════════════════════════════════════════════════════
async function submitBookingForm() {
    const body = {
        event_name:     $('bk_event_name').value.trim(),
        customer_name:  $('bk_customer_name').value.trim(),
        customer_phone: $('bk_customer_phone').value.trim(),
        room_id:        $('bk_room_id').value || null,
        date_start:     $('bk_date_start').value,
        date_end:       $('bk_date_end').value,
        num_guests:     $('bk_num_guests').value,
        status:         $('bk_status').value,
        total_price:    $('bk_total_price').value,
        notes:          $('bk_notes').value.trim()
    };
    
    // Front-end Validations
    if (!body.event_name) { showToast('Event name is required', 'warning'); return; }
    if (!body.customer_name) { showToast('Customer name is required', 'warning'); return; }
    if (!body.customer_phone) { showToast('Customer phone is required', 'warning'); return; }
    if (body.customer_phone && !/^\+?[0-9\s\-\(\)]{7,15}$/.test(body.customer_phone)) { showToast('Invalid phone number format', 'warning'); return; }
    if (!body.date_start) { showToast('Start date is required', 'warning'); return; }
    if (body.date_end && new Date(body.date_start) > new Date(body.date_end)) { showToast('End date cannot be before start date', 'warning'); return; }
    if (body.num_guests && body.num_guests < 1) { showToast('Number of guests must be at least 1', 'warning'); return; }
    if (body.total_price && body.total_price < 0) { showToast('Total price cannot be negative', 'warning'); return; }

    const overlaps = checkOverlap(body.room_id, body.date_start, body.date_end);
    if (overlaps && body.status === 'Confirmed') {
        if (confirm('⚠️ VENUE OVERLAP CONFLICT!\n\nThis room/venue is already booked for the selected dates. Would you like to add the customer to the Waitlist queue instead?')) {
            try {
                await store.fetchAPI('/waitlist', {
                    method: 'POST',
                    body: JSON.stringify({
                        room_id: body.room_id,
                        customer_name: body.customer_name,
                        customer_phone: body.customer_phone,
                        date_start: body.date_start,
                        date_end: body.date_end,
                        num_guests: body.num_guests,
                        event_name: body.event_name,
                        notes: body.notes || ''
                    })
                });
                await store.refreshData();
                showToast('Customer added to the Waitlist queue ✓', 'success');
                clearBookingForm();
            } catch (err) {
                showToast('Failed to add to Waitlist: ' + err.message, 'danger');
            }
        }
        return;
    }

    try {
        await store.fetchAPI('/reservations', { method: 'POST', body: JSON.stringify(body) });
        await store.refreshData();
        showToast('Booking saved to database ✓', 'success');
        clearBookingForm();
    } catch(e) { showToast('Database error: ' + e.message, 'danger'); }
}

function clearBookingForm() {
    ['bk_event_name','bk_customer_name','bk_customer_phone','bk_date_start','bk_date_end','bk_num_guests','bk_total_price','bk_notes']
        .forEach(id => { if ($(id)) $(id).value = ''; });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED TABLE RENDERER
// ═══════════════════════════════════════════════════════════════════════════════
function reservationTable(reservations, opts = {}) {
    if (!reservations.length) return `
        <div class="empty-state">
            <i class="fa-regular fa-calendar-xmark"></i>
            <h3>No Records Found</h3>
            <p>Nothing in the database yet.</p>
        </div>`;
    return `
    <div class="table-wrapper">
        <table class="data-table">
            <thead><tr>
                <th>Event</th><th>Customer</th><th>Venue</th>
                <th>Guests</th><th>From</th><th>To</th>
                <th>Value</th><th>Status</th><th>Actions</th>
            </tr></thead>
            <tbody>
            ${reservations.map(r => `
                <tr>
                    <td style="font-weight:700;">${r.event_name}</td>
                    <td>
                        <div style="font-weight:600;">${r.customer_name}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${r.customer_phone || ''}</div>
                    </td>
                    <td style="color:var(--text-muted);">${r.room_name || '—'}</td>
                    <td>${r.num_guests || '—'}</td>
                    <td style="font-size:13px;color:var(--text-muted);">${formatDate(r.date_start)}</td>
                    <td style="font-size:13px;color:var(--text-muted);">${formatDate(r.date_end)}</td>
                    <td style="color:var(--primary);font-weight:700;">${formatCurrency(r.total_price)}</td>
                    <td>${statusBadge(r.status)}</td>
                    <td>
                        <div style="display:flex;gap:6px;flex-wrap:wrap;">
                            ${opts.showConfirm && r.status === 'Pending' ? `
                                <button class="btn btn-primary btn-sm" onclick="updateReservationStatus(${r.id},'Confirmed')">
                                    <i class="fa-solid fa-check"></i>
                                </button>` : ''}
                            ${opts.showReject && r.status === 'Pending' ? `
                                <button class="btn btn-danger btn-sm" onclick="updateReservationStatus(${r.id},'Cancelled')">
                                    <i class="fa-solid fa-xmark"></i>
                                </button>` : ''}
                            <button class="btn btn-outline btn-sm" onclick='openReservationModal(${JSON.stringify(r)})' title="Edit">
                                <i class="fa-solid fa-pen"></i>
                            </button>
                            <button class="btn btn-danger btn-sm" onclick="deleteReservation(${r.id})" title="Delete">
                                <i class="fa-solid fa-trash"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `).join('')}
            </tbody>
        </table>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIEWS
// ═══════════════════════════════════════════════════════════════════════════════

function renderDashboard(c) {
    const { reservations, customers, eventRooms } = store.data;
    const revenue   = reservations.reduce((a, r) => a + parseFloat(r.total_price || 0), 0);
    const confirmed = reservations.filter(r => r.status === 'Confirmed').length;
    const pending   = reservations.filter(r => r.status === 'Pending').length;
    const upcoming  = reservations.filter(r => new Date(r.date_start) >= new Date()).length;
    const available = eventRooms.filter(r => r.status === 'Available').length;

    c.innerHTML = `
    <div class="stats-grid">
        <div class="stat-card">
            <div class="stat-icon" style="background:rgba(0,242,254,0.15);">
                <i class="fa-solid fa-calendar-check" style="color:#00f2fe;"></i>
            </div>
            <div class="stat-info">
                <div class="stat-value">${reservations.length}</div>
                <div class="stat-label">Total Reservations</div>
                <div class="stat-trend positive"><i class="fa-solid fa-circle-dot" style="margin-right:4px;"></i>${confirmed} Confirmed · ${pending} Pending</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:rgba(16,185,129,0.15);">
                <i class="fa-solid fa-users" style="color:#10b981;"></i>
            </div>
            <div class="stat-info">
                <div class="stat-value">${customers.length}</div>
                <div class="stat-label">Registered Customers</div>
                <div class="stat-trend positive"><i class="fa-solid fa-circle-dot" style="margin-right:4px;"></i>Synced from DB</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:rgba(79,172,254,0.15);">
                <i class="fa-solid fa-door-open" style="color:#4facfe;"></i>
            </div>
            <div class="stat-info">
                <div class="stat-value">${eventRooms.length}</div>
                <div class="stat-label">Venues</div>
                <div class="stat-trend positive"><i class="fa-solid fa-circle-dot" style="margin-right:4px;"></i>${available} Available</div>
            </div>
        </div>
        <div class="stat-card">
            <div class="stat-icon" style="background:rgba(245,158,11,0.15);">
                <i class="fa-solid fa-sack-dollar" style="color:#f59e0b;"></i>
            </div>
            <div class="stat-info">
                <div class="stat-value" style="font-size:20px;">${formatCurrency(revenue)}</div>
                <div class="stat-label">Total Revenue</div>
                <div class="stat-trend positive"><i class="fa-solid fa-arrow-trend-up" style="margin-right:4px;"></i>${upcoming} upcoming</div>
            </div>
        </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div class="card">
            <div class="section-header">
                <div><h2>Recent Reservations</h2><p>Latest bookings from database</p></div>
                <button class="btn btn-primary btn-sm" onclick="openReservationModal()">
                    <i class="fa-solid fa-plus" style="margin-right:6px;"></i>New
                </button>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Event</th><th>Customer</th><th>Date</th><th>Status</th></tr></thead>
                    <tbody>
                        ${reservations.length === 0 ? `<tr><td colspan="4"><div class="empty-state" style="padding:20px;"><i class="fa-regular fa-calendar-xmark"></i><p>No reservations yet</p></div></td></tr>` : ''}
                        ${reservations.slice(0,6).map(r => `
                            <tr>
                                <td style="font-weight:700;">${r.event_name}</td>
                                <td style="color:var(--text-muted);">${r.customer_name}</td>
                                <td style="color:var(--text-muted);font-size:13px;">${formatDate(r.date_start)}</td>
                                <td>${statusBadge(r.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div class="card">
            <div class="section-header">
                <div><h2>Venues</h2><p>${available} available now</p></div>
                <button class="btn btn-outline btn-sm" onclick="openRoomModal()">
                    <i class="fa-solid fa-plus" style="margin-right:6px;"></i>Add
                </button>
            </div>
            <div class="table-wrapper">
                <table class="data-table">
                    <thead><tr><th>Venue</th><th>Type</th><th>Price/Day</th><th>Status</th></tr></thead>
                    <tbody>
                        ${eventRooms.length === 0 ? `<tr><td colspan="4"><div class="empty-state" style="padding:20px;"><i class="fa-solid fa-door-closed"></i><p>No venues yet</p></div></td></tr>` : ''}
                        ${eventRooms.map(r => `
                            <tr>
                                <td style="font-weight:700;">${r.name}</td>
                                <td style="color:var(--text-muted);">${r.type}</td>
                                <td style="color:var(--primary);font-weight:700;">${formatCurrency(r.price_per_day)}</td>
                                <td>${statusBadge(r.status)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    </div>`;
}

function renderCustomers(c) {
    const { customers } = store.data;
    c.innerHTML = `
    <div class="card">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-user-plus" style="color:var(--primary);margin-right:10px;"></i>Customer Registration</h2>
                <p>${customers.length} customers synced from database</p>
            </div>
            <button class="btn btn-primary" onclick="openCustomerModal()">
                <i class="fa-solid fa-plus" style="margin-right:8px;"></i>Register Customer
            </button>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>#</th><th>Customer</th><th>Phone</th><th>Email</th><th>Loyalty</th><th>Spent</th><th>Actions</th></tr></thead>
                <tbody>
                    ${customers.length === 0 ? `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-users"></i><h3>No Customers</h3><p>Register your first customer to get started</p></div></td></tr>` : ''}
                    ${customers.map((cu, i) => `
                        <tr>
                            <td style="color:var(--text-muted);font-size:12px;">${String(i+1).padStart(2,'0')}</td>
                            <td>
                                <div style="display:flex;align-items:center;gap:10px;">
                                    <div style="width:34px;height:34px;border-radius:50%;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-weight:800;color:var(--primary);font-size:14px;">${(cu.name||'?')[0].toUpperCase()}</div>
                                    <span style="font-weight:700;">${cu.name}</span>
                                </div>
                            </td>
                            <td style="color:var(--text-muted);">${cu.phone || '—'}</td>
                            <td style="color:var(--text-muted);">${cu.email || '—'}</td>
                            <td><span class="badge badge-info">${cu.loyalty_points || 0} pts</span></td>
                            <td style="color:var(--primary);font-weight:700;">${formatCurrency(cu.total_spent)}</td>
                            <td>
                                <div style="display:flex;gap:6px;">
                                    <button class="btn btn-outline btn-sm" onclick='openCustomerModal(${JSON.stringify(cu)})'>
                                        <i class="fa-solid fa-pen"></i>
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="deleteCustomer(${cu.id})">
                                        <i class="fa-solid fa-trash"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

function renderInquiry(c) {
    const pending = store.data.reservations.filter(r => r.status === 'Pending');
    c.innerHTML = `
    <div class="card">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-clipboard-question" style="color:var(--primary);margin-right:10px;"></i>Inquiry Management</h2>
                <p>${pending.length} pending inquiry(ies) in database</p>
            </div>
            <button class="btn btn-primary" onclick="openReservationModal()">
                <i class="fa-solid fa-plus" style="margin-right:8px;"></i>New Inquiry
            </button>
        </div>
        ${pending.length === 0
            ? `<div class="empty-state"><i class="fa-solid fa-inbox"></i><h3>No Pending Inquiries</h3><p>All reservations are confirmed or there are none yet</p></div>`
            : reservationTable(pending, { showConfirm: true, showReject: true })
        }
    </div>`;
}

function renderBooking(c) {
    const roomOpts = store.data.eventRooms
        .map(r => `<option value="${r.id}">${r.name} — ${formatCurrency(r.price_per_day)}/day (Cap: ${r.capacity})</option>`)
        .join('');

    const waitlist = store.data.waitlist || [];

    c.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-calendar-plus" style="color:var(--primary);margin-right:10px;"></i>Create Booking</h2>
                <p>All entries are saved directly to the database</p>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:0 32px;">
            <div class="form-group"><label>Event Name *</label><input id="bk_event_name" type="text" placeholder="e.g. Wedding Reception"></div>
            <div class="form-group"><label>Venue</label><select id="bk_room_id"><option value="">-- No Venue --</option>${roomOpts}</select></div>
            <div class="form-group"><label>Customer Name *</label><input id="bk_customer_name" type="text" placeholder="Full name"></div>
            <div class="form-group"><label>Phone</label><input id="bk_customer_phone" type="text" placeholder="+94 77 ..."></div>
            <div class="form-group"><label>From Date *</label><input id="bk_date_start" type="date"></div>
            <div class="form-group"><label>To Date</label><input id="bk_date_end" type="date"></div>
            <div class="form-group"><label>No. of Guests</label><input id="bk_num_guests" type="number" placeholder="100" min="1"></div>
            <div class="form-group"><label>Total Price (${sym()})</label><input id="bk_total_price" type="number" placeholder="0.00"></div>
            <div class="form-group"><label>Status</label>
                <select id="bk_status">
                    <option value="Pending">Pending</option>
                    <option value="Confirmed" selected>Confirmed</option>
                </select>
            </div>
        </div>
        <div class="form-group"><label>Notes</label><textarea id="bk_notes" rows="2" placeholder="Any special requirements..." style="resize:vertical;"></textarea></div>
        <div style="display:flex;gap:12px;margin-top:4px;">
            <button class="btn btn-primary" onclick="submitBookingForm()">
                <i class="fa-solid fa-database" style="margin-right:8px;"></i>Save to Database
            </button>
            <button class="btn btn-outline" onclick="clearBookingForm()">
                <i class="fa-solid fa-rotate-left" style="margin-right:8px;"></i>Clear
            </button>
        </div>
    </div>

    <!-- Waitlist Card -->
    <div class="card" style="margin-bottom:24px;">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-people-line" style="color:var(--primary);margin-right:10px;"></i>Customer Waitlist Queue</h2>
                <p>${waitlist.length} customers waitlisted for occupied venues</p>
            </div>
        </div>
        ${waitlist.length === 0 ? `
            <div class="empty-state" style="padding:24px;">
                <i class="fa-solid fa-users-slash"></i>
                <h3>Waitlist is empty</h3>
                <p>No customers currently in the waitlist queue.</p>
            </div>
        ` : `
            <div class="table-wrapper">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Room / Venue</th>
                            <th>Customer</th>
                            <th>Phone</th>
                            <th>Event Name</th>
                            <th>Dates Requested</th>
                            <th>Guests</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${waitlist.map(w => `
                            <tr>
                                <td style="font-weight:700;">${w.room_name || '—'}</td>
                                <td style="font-weight:600;">${w.customer_name}</td>
                                <td style="color:var(--text-muted);">${w.customer_phone || '—'}</td>
                                <td>${w.event_name}</td>
                                <td style="font-size:13px;color:var(--text-muted);">${formatDate(w.date_start)} ${w.date_end ? '→ ' + formatDate(w.date_end) : ''}</td>
                                <td>${w.num_guests || '—'}</td>
                                <td>
                                    <button class="btn btn-danger btn-sm" onclick="deleteWaitlistEntry(${w.id})">
                                        <i class="fa-solid fa-xmark" style="margin-right:5px;"></i>Remove
                                    </button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `}
    </div>

    <div class="card">
        <div class="section-header">
            <div><h2>All Bookings</h2><p>${store.data.reservations.length} records in database</p></div>
        </div>
        ${reservationTable(store.data.reservations, {})}
    </div>`;
}

function renderEvents(c) {
    c.innerHTML = `
    <div class="card">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-champagne-glasses" style="color:var(--primary);margin-right:10px;"></i>Event Management</h2>
                <p>${store.data.reservations.length} events in database</p>
            </div>
            <button class="btn btn-primary" onclick="openReservationModal()">
                <i class="fa-solid fa-plus" style="margin-right:8px;"></i>Create Event
            </button>
        </div>
        ${reservationTable(store.data.reservations, { showConfirm: true, showReject: true })}
    </div>`;
}

function renderRooms(c) {
    const { eventRooms, maintenanceTasks } = store.data;
    const icons = { Banquet: 'fa-champagne-glasses', Meeting: 'fa-briefcase', Outdoor: 'fa-tree', Conference: 'fa-people-group' };

    // Group tasks by room
    const tasksByRoom = {};
    (maintenanceTasks || []).forEach(t => {
        if (!tasksByRoom[t.room_id]) tasksByRoom[t.room_id] = [];
        tasksByRoom[t.room_id].push(t);
    });

    c.innerHTML = `
    <div class="section-header">
        <div>
            <h2><i class="fa-solid fa-door-open" style="color:var(--primary);margin-right:10px;"></i>Room Reservation</h2>
            <p>${eventRooms.length} venues in database</p>
        </div>
        <button class="btn btn-primary" onclick="openRoomModal()">
            <i class="fa-solid fa-plus" style="margin-right:8px;"></i>Add Venue
        </button>
    </div>
    
    <div style="display:grid; grid-template-columns: 1fr 340px; gap: 24px; align-items: start;">
        <div>
            ${eventRooms.length === 0 ? `<div class="card"><div class="empty-state"><i class="fa-solid fa-door-closed"></i><h3>No Venues in Database</h3><p>Add your first venue to get started</p></div></div>` : ''}
            <div class="rooms-grid" style="grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
                ${eventRooms.map(r => `
                <div class="room-card">
                    <div class="room-icon"><i class="fa-solid ${icons[r.type] || 'fa-building'}"></i></div>
                    <div class="room-name">${r.name}</div>
                    <div class="room-price">${formatCurrency(r.price_per_day)} <span style="font-size:13px;font-weight:400;color:var(--text-muted);">/ day</span></div>
                    <div class="room-meta">
                        <span><i class="fa-solid fa-users" style="color:var(--primary);margin-right:5px;"></i>${r.capacity} guests</span>
                        <span><i class="fa-solid fa-tag" style="color:var(--primary);margin-right:5px;"></i>${r.type}</span>
                    </div>
                    <div style="margin-top:12px;">${statusBadge(r.status)}</div>
                    <div class="room-actions">
                        <button class="btn btn-primary btn-sm" style="flex:1;justify-content:center;" onclick="openReservationModal()">
                            <i class="fa-solid fa-calendar-plus" style="margin-right:6px;"></i>Book
                        </button>
                        <button class="btn btn-outline btn-sm" onclick='openRoomModal(${JSON.stringify(r)})'>
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        <button class="btn btn-danger btn-sm" onclick="deleteRoom(${r.id})">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>`).join('')}
            </div>
        </div>
        
        <!-- Checklist Side Card -->
        <div class="card">
            <h3 style="margin-bottom:12px;"><i class="fa-solid fa-screwdriver-wrench" style="color:var(--primary);margin-right:10px;"></i>Venue Setup & Cleaning</h3>
            <p style="font-size:12px;color:var(--text-muted);margin-bottom:20px;line-height:1.4;">Manage setup buffers and cleaning checklists before venues go back to Available.</p>
            
            ${eventRooms.length === 0 ? '<div style="font-size:13px;color:var(--text-muted);font-style:italic;">No venues registered yet.</div>' : ''}
            
            ${eventRooms.map(room => {
                const roomTasks = tasksByRoom[room.id] || [];
                const completed = roomTasks.filter(t => t.status === 'Completed');
                
                return `
                <div style="margin-bottom:18px; padding-bottom:14px; border-bottom:1px solid var(--glass-border); &:last-child { border: none; }">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                        <strong style="font-size:13px;color:var(--text-bright);">${room.name}</strong>
                        <span style="font-size:11px;background:rgba(0,242,254,0.1);color:var(--primary);padding:2px 6px;border-radius:8px;font-weight:600;">
                            ${completed.length}/${roomTasks.length} Done
                        </span>
                    </div>
                    ${roomTasks.length === 0 ? `
                        <div style="font-size:12px;color:var(--text-muted);font-style:italic;margin-top:4px;">No active setup or cleaning tasks.</div>
                    ` : `
                        <div style="display:flex; flex-direction:column; gap:6px; margin-top:8px;">
                            ${roomTasks.map(task => {
                                const isChecked = task.status === 'Completed';
                                return `
                                <label style="display:flex; align-items:flex-start; gap:8px; font-size:12px; cursor:pointer; user-select:none; line-height:1.3;">
                                    <input type="checkbox" ${isChecked ? 'checked' : ''} 
                                        onchange="toggleMaintenanceTask(${task.id}, this.checked)"
                                        style="width:14px; height:14px; margin-top:1px; cursor:pointer;">
                                    <span style="${isChecked ? 'text-decoration:line-through;color:var(--text-muted);' : ''}">${task.task_name}</span>
                                </label>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
                `;
            }).join('')}
        </div>
    </div>`;
}

async function toggleMaintenanceTask(id, isChecked) {
    const status = isChecked ? 'Completed' : 'Pending';
    try {
        await store.fetchAPI(`/maintenance-tasks/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        await store.refreshData();
        showToast(`Task marked as ${status} ✓`, 'success');
    } catch (err) {
        showToast('Failed to update task: ' + err.message, 'danger');
    }
}

function renderAgreement(c) {
    const confirmed = store.data.reservations.filter(r => r.status === 'Confirmed');
    c.innerHTML = `
    <div class="card">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-file-contract" style="color:var(--primary);margin-right:10px;"></i>Agreements</h2>
                <p>${confirmed.length} confirmed bookings from database</p>
            </div>
        </div>
        <div class="table-wrapper">
            <table class="data-table">
                <thead><tr><th>Ref #</th><th>Event</th><th>Customer</th><th>Venue</th><th>Value</th><th>Event Date</th><th>Actions</th></tr></thead>
                <tbody>
                    ${confirmed.length === 0
                        ? `<tr><td colspan="7"><div class="empty-state"><i class="fa-solid fa-file-circle-xmark"></i><h3>No Agreements</h3><p>Confirm reservations to generate agreements</p></div></td></tr>`
                        : confirmed.map(r => `
                        <tr>
                            <td style="color:var(--primary);font-weight:700;">AGR-${String(r.id).padStart(4,'0')}</td>
                            <td style="font-weight:700;">${r.event_name}</td>
                            <td>
                                ${r.customer_name}<br>
                                <span style="font-size:12px;color:var(--text-muted);">${r.customer_phone || ''}</span>
                            </td>
                            <td style="color:var(--text-muted);">${r.room_name || '—'}</td>
                            <td style="color:var(--primary);font-weight:700;">${formatCurrency(r.total_price)}</td>
                            <td style="font-size:13px;color:var(--text-muted);">${formatDate(r.date_start)} → ${formatDate(r.date_end)}</td>
                            <td>
                                <div style="display:flex;gap:6px;">
                                    <button class="btn btn-outline btn-sm" onclick="printAgreement(${r.id},'${r.event_name}','${r.customer_name}')">
                                        <i class="fa-solid fa-print" style="margin-right:5px;"></i>Print
                                    </button>
                                    <button class="btn btn-danger btn-sm" onclick="updateReservationStatus(${r.id},'Cancelled')">
                                        <i class="fa-solid fa-xmark"></i>
                                    </button>
                                </div>
                            </td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>`;
}

let _currentSigningReservationId = null;
let _sigCanvas = null;
let _sigCtx = null;
let _isDrawing = false;

function initSignatureCapture(reservationId) {
    _currentSigningReservationId = reservationId;
    openModal('signatureModal');
    
    if (!_sigCanvas) {
        _sigCanvas = $('sigCanvas');
        _sigCtx = _sigCanvas.getContext('2d');
        
        _sigCtx.strokeStyle = '#ffffff';
        _sigCtx.lineWidth = 3;
        _sigCtx.lineCap = 'round';
        
        _sigCanvas.addEventListener('mousedown', startDrawing);
        _sigCanvas.addEventListener('mousemove', draw);
        window.addEventListener('mouseup', stopDrawing);
        
        _sigCanvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            const rect = _sigCanvas.getBoundingClientRect();
            _sigCtx.beginPath();
            _sigCtx.moveTo(touch.clientX - rect.left, touch.clientY - rect.top);
            _isDrawing = true;
        }, { passive: false });
        
        _sigCanvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (!_isDrawing) return;
            const touch = e.touches[0];
            const rect = _sigCanvas.getBoundingClientRect();
            _sigCtx.lineTo(touch.clientX - rect.left, touch.clientY - rect.top);
            _sigCtx.stroke();
        }, { passive: false });
        
        _sigCanvas.addEventListener('touchend', () => { _isDrawing = false; });
        
        $('saveSignatureBtn').addEventListener('click', saveSignature);
    }
    clearCanvas();
}

function startDrawing(e) {
    const rect = _sigCanvas.getBoundingClientRect();
    _sigCtx.beginPath();
    _sigCtx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
    _isDrawing = true;
}

function draw(e) {
    if (!_isDrawing) return;
    const rect = _sigCanvas.getBoundingClientRect();
    _sigCtx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    _sigCtx.stroke();
}

function stopDrawing() {
    _isDrawing = false;
}

function clearCanvas() {
    if (_sigCtx && _sigCanvas) {
        _sigCtx.clearRect(0, 0, _sigCanvas.width, _sigCanvas.height);
    }
}

async function saveSignature() {
    if (!_currentSigningReservationId) return;
    const dataUrl = _sigCanvas.toDataURL();
    try {
        await store.fetchAPI(`/reservations/${_currentSigningReservationId}/signature`, {
            method: 'PATCH',
            body: JSON.stringify({ signature_data: dataUrl })
        });
        showToast('E-Signature saved to database ✓', 'success');
        closeModal('signatureModal');
        await store.refreshData();
        printAgreement(_currentSigningReservationId);
    } catch (err) {
        showToast('Failed to save signature: ' + err.message, 'danger');
    }
}

function printAgreement(id) {
    const r = store.data.reservations.find(res => res.id === id);
    if (!r) { showToast('Reservation not found', 'danger'); return; }

    if (!r.signature_data) {
        initSignatureCapture(id);
        return;
    }

    const w = window.open('', '_blank');
    const currency = sym();
    const dateFormatted = formatDate(r.date_start);
    const dateEndFormatted = r.date_end ? formatDate(r.date_end) : dateFormatted;

    w.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Agreement - AGR-${String(r.id).padStart(4, '0')}</title>
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Outfit', sans-serif; color: #222; padding: 40px; line-height: 1.6; }
                .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
                .header h1 { margin: 0; font-size: 28px; letter-spacing: 2px; text-transform: uppercase; }
                .header p { margin: 5px 0 0 0; color: #666; font-size: 14px; }
                .agreement-title { text-align: center; font-size: 20px; font-weight: bold; margin-bottom: 30px; text-transform: uppercase; text-decoration: underline; }
                
                /* Borderless tables reset */
                .meta-table, .signature-table {
                    width: 100%;
                    border-collapse: collapse;
                    border: none !important;
                    margin-bottom: 30px;
                    background: transparent !important;
                }
                .meta-table td, .signature-table td {
                    border: none !important;
                    padding: 0 !important;
                    background: transparent !important;
                    text-align: left;
                    vertical-align: top;
                }
                
                .meta-table {
                    border-bottom: 1px solid #eee;
                    font-weight: bold;
                    font-size: 14px;
                }
                .meta-table td {
                    padding: 0 0 10px 0 !important;
                }
                
                .info-table { width: 100%; border: none; margin-bottom: 30px; border-collapse: collapse; }
                .info-table td { border: none !important; padding: 10px 20px 10px 0 !important; background: transparent !important; }
                .info-table td.right-col { border-left: 1px solid #eee !important; padding: 10px 0 10px 20px !important; }
                
                .section-title { font-weight: bold; font-size: 16px; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; text-transform: uppercase; }
                
                table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
                th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
                th { background-color: #f5f5f5; }
                
                .terms { font-size: 12px; color: #555; border-top: 1px solid #eee; padding-top: 20px; margin-top: 50px; }
                
                /* Signature section styles */
                .signature-table {
                    margin-top: 80px;
                }
                .signature-table td {
                    width: 43%;
                    vertical-align: bottom;
                    text-align: center;
                }
                .signature-table td.spacer {
                    width: 14%;
                }
                .signature-space {
                    height: 90px;
                    text-align: center;
                    font-size: 0;
                    line-height: 90px;
                    margin-bottom: 10px;
                }
                .signature-space img {
                    max-height: 90px;
                    max-width: 240px;
                    vertical-align: bottom;
                    display: inline-block;
                    filter: invert(1);
                }
                .signature-line-text {
                    border-top: 1px solid #000;
                    padding-top: 8px;
                    font-size: 14px;
                    line-height: 1.5;
                }
                
                .print-btn-container { text-align: center; margin-top: 40px; }
                @media print {
                    body { padding: 20px; }
                    .print-btn-container { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h1>${store.data.settings.business_name || 'ASCENDIA BANQUETS'}</h1>
                <p>${store.data.settings.business_name || 'ASCENDIA BANQUETS'} · General Agreement</p>
            </div>
            
            <div class="agreement-title">${(store.data.settings.business_name || 'ASCENDIA BANQUETS').toUpperCase()} AGREEMENT</div>
            
            <table class="meta-table">
                <tr>
                    <td style="text-align: left;">Agreement Reference: AGR-${String(r.id).padStart(4, '0')}</td>
                    <td style="text-align: right;">Date Generated: ${new Date().toLocaleDateString('en-GB')}</td>
                </tr>
            </table>

            <table class="info-table">
                <tr>
                    <td style="width: 50%; vertical-align: top;">
                        <div class="section-title">Client Information</div>
                        <div style="line-height: 1.8; font-size: 14px;">
                            <strong>Name:</strong> ${r.customer_name}<br>
                            <strong>Contact Phone:</strong> ${r.customer_phone || '—'}<br>
                        </div>
                    </td>
                    <td class="right-col" style="width: 50%; vertical-align: top;">
                        <div class="section-title">Venue & Event Details</div>
                        <div style="line-height: 1.8; font-size: 14px;">
                            <strong>Venue / Room:</strong> ${r.room_name || 'General Venue'}<br>
                            <strong>Event Name:</strong> ${r.event_name}<br>
                            <strong>Date of Event:</strong> ${dateFormatted} to ${dateEndFormatted}<br>
                            <strong>Number of Guests:</strong> ${r.num_guests || '—'}
                        </div>
                    </td>
                </tr>
            </table>

            <div class="section-title">Billing & Financial Breakdown</div>
            <table>
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Price Rate</th>
                        <th>Total Price</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Banquet Hall / Event Room reservation for dates: ${dateFormatted} to ${dateEndFormatted}</td>
                        <td>${formatCurrency(r.price_per_day)} / day</td>
                        <td style="font-weight: bold; color: #000;">${formatCurrency(r.total_price)}</td>
                    </tr>
                </tbody>
            </table>

            <div class="terms">
                <strong>TERMS & CONDITIONS:</strong><br>
                1. The client agrees to pay the total reservation fee at least 7 days before the event starts.<br>
                2. Cancellations made within 48 hours of the event are non-refundable. Cancellations prior to this are eligible for 50% refund.<br>
                3. The client is responsible for any damage caused to properties or venues during the event.<br>
                4. Ascendia Hotel guarantees the reserved room will be set up and prepared according to specification detailed in internal notes.
            </div>

            <table class="signature-table">
                <tr>
                    <td>
                        <div class="signature-space"></div>
                        <div class="signature-line-text">
                            Authorized Signatory<br>
                            <span style="font-size: 12px; color: #666;">${store.data.settings.business_name || 'ASCENDIA BANQUETS'}</span>
                        </div>
                    </td>
                    <td class="spacer"></td>
                    <td>
                        <div class="signature-space">
                            <img src="${r.signature_data}" alt="Customer Signature">
                        </div>
                        <div class="signature-line-text">
                            <strong>${r.customer_name}</strong><br>
                            <span style="font-size: 12px; color: #666;">Customer Signature (E-Signed)</span>
                        </div>
                    </td>
                </tr>
            </table>

            <div class="print-btn-container">
                <button onclick="window.print();" style="padding: 10px 20px; font-size: 16px; background: #00f2fe; border: none; border-radius: 6px; cursor: pointer; color: black; font-weight: bold;">Print Document</button>
            </div>
        </body>
        </html>
    `);
    w.document.close();
}

function renderApproval(c) {
    const pending = store.data.reservations.filter(r => r.status === 'Pending');
    c.innerHTML = `
    <div class="card">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-stamp" style="color:var(--primary);margin-right:10px;"></i>Sales Head Approval</h2>
                <p>${pending.length} reservation(s) awaiting approval in database</p>
            </div>
        </div>
        ${pending.length === 0
            ? `<div class="empty-state">
                <i class="fa-solid fa-circle-check" style="color:#10b981;opacity:1;font-size:56px;margin-bottom:16px;"></i>
                <h3>All Clear!</h3>
                <p>No pending approvals at this time.</p>
               </div>`
            : `<div class="table-wrapper"><table class="data-table">
                <thead><tr><th>Event</th><th>Customer</th><th>Venue</th><th>Guests</th><th>Value</th><th>Date</th><th>Decision</th></tr></thead>
                <tbody>
                ${pending.map(r => `
                    <tr>
                        <td style="font-weight:700;">${r.event_name}</td>
                        <td>${r.customer_name}<br><span style="font-size:12px;color:var(--text-muted);">${r.customer_phone || ''}</span></td>
                        <td style="color:var(--text-muted);">${r.room_name || '—'}</td>
                        <td>${r.num_guests || '—'}</td>
                        <td style="color:var(--primary);font-weight:700;">${formatCurrency(r.total_price)}</td>
                        <td style="font-size:13px;color:var(--text-muted);">${formatDate(r.date_start)}</td>
                        <td>
                            <div style="display:flex;gap:8px;">
                                <button class="btn btn-primary btn-sm" onclick="updateReservationStatus(${r.id},'Confirmed')">
                                    <i class="fa-solid fa-check" style="margin-right:5px;"></i>Approve & Save
                                </button>
                                <button class="btn btn-danger btn-sm" onclick="updateReservationStatus(${r.id},'Cancelled')">
                                    <i class="fa-solid fa-xmark" style="margin-right:5px;"></i>Reject
                                </button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
                </tbody>
            </table></div>`}
    </div>`;
}

function renderCalendar(c) {
    const now = new Date();
    const year = now.getFullYear(), month = now.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    const reservedDays = new Map();
    store.data.reservations.forEach(r => {
        const d = new Date(r.date_start);
        if (d.getFullYear() === year && d.getMonth() === month) {
            const day = d.getDate();
            if (!reservedDays.has(day)) reservedDays.set(day, []);
            reservedDays.get(day).push(r);
        }
    });

    let cells = '';
    for (let i = 0; i < firstDay; i++) cells += `<div class="cal-cell empty"></div>`;
    for (let d = 1; d <= daysInMonth; d++) {
        const isToday = d === now.getDate();
        const hasEvent = reservedDays.has(d);
        const eventCount = hasEvent ? reservedDays.get(d).length : 0;
        cells += `<div class="cal-cell ${isToday ? 'today' : ''} ${hasEvent ? 'has-event' : ''}" title="${hasEvent ? eventCount+' event(s)' : ''}">${d}${hasEvent ? `<span style="font-size:9px;color:var(--primary);">${eventCount}</span>` : ''}</div>`;
    }

    const thisMonthRes = store.data.reservations.filter(r => {
        const d = new Date(r.date_start);
        return d.getFullYear() === year && d.getMonth() === month;
    });

    c.innerHTML = `
    <div style="display:grid;grid-template-columns:400px 1fr;gap:24px;align-items:start;">
        <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h3>${monthNames[month]} ${year}</h3>
                <span class="badge badge-info">${reservedDays.size} event days</span>
            </div>
            <div class="cal-grid" style="margin-bottom:8px;">
                ${dayNames.map(d => `<div class="cal-header-cell">${d}</div>`).join('')}
            </div>
            <div class="cal-grid">${cells}</div>
            <div style="display:flex;gap:16px;margin-top:16px;padding-top:16px;border-top:1px solid var(--glass-border);">
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);">
                    <div style="width:10px;height:10px;border-radius:50%;background:var(--primary);"></div> Has Event
                </div>
                <div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);">
                    <div style="width:10px;height:10px;border-radius:3px;background:var(--primary-light);border:1px solid var(--primary);"></div> Today
                </div>
            </div>
        </div>

        <div class="card">
            <div class="section-header">
                <div><h2>Events This Month</h2><p>${thisMonthRes.length} in database for ${monthNames[month]}</p></div>
            </div>
            ${reservationTable(thisMonthRes, {})}
        </div>
    </div>`;
}

function renderReports(c) {
    const { reservations, eventRooms } = store.data;
    const revenue = reservations.reduce((a, r) => a + parseFloat(r.total_price || 0), 0);
    const byStatus = { Confirmed: 0, Pending: 0, Cancelled: 0 };
    reservations.forEach(r => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });

    const byVenue = {};
    reservations.forEach(r => {
        const vn = r.room_name || 'No Venue';
        if (!byVenue[vn]) byVenue[vn] = { count: 0, revenue: 0 };
        byVenue[vn].count++;
        byVenue[vn].revenue += parseFloat(r.total_price || 0);
    });
    const topVenue = Object.entries(byVenue).sort((a,b) => b[1].revenue - a[1].revenue)[0];

    c.innerHTML = `
    <div class="stats-grid" style="margin-bottom:24px;">
        <div class="stat-card"><div class="stat-icon" style="background:rgba(0,242,254,0.15);"><i class="fa-solid fa-calendar-check" style="color:#00f2fe;"></i></div><div><div class="stat-value">${reservations.length}</div><div class="stat-label">Total Bookings (DB)</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(16,185,129,0.15);"><i class="fa-solid fa-circle-check" style="color:#10b981;"></i></div><div><div class="stat-value">${byStatus.Confirmed}</div><div class="stat-label">Confirmed</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(245,158,11,0.15);"><i class="fa-solid fa-clock" style="color:#f59e0b;"></i></div><div><div class="stat-value">${byStatus.Pending}</div><div class="stat-label">Pending Approval</div></div></div>
        <div class="stat-card"><div class="stat-icon" style="background:rgba(245,158,11,0.15);"><i class="fa-solid fa-sack-dollar" style="color:#f59e0b;"></i></div><div><div class="stat-value" style="font-size:18px;">${formatCurrency(revenue)}</div><div class="stat-label">Total Revenue (DB)</div></div></div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;">
        <div class="card">
            <h3 style="margin-bottom:20px;">Bookings by Status</h3>
            ${Object.entries(byStatus).map(([s, n]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <div style="display:flex;align-items:center;gap:10px;">${statusBadge(s)}</div>
                    <div style="font-weight:700;">${n}</div>
                </div>
                <div style="height:8px;border-radius:4px;background:rgba(255,255,255,0.08);margin-bottom:16px;">
                    <div style="height:100%;border-radius:4px;background:var(--primary);width:${reservations.length ? Math.round(n/reservations.length*100) : 0}%;transition:width 0.6s ease;"></div>
                </div>
            `).join('')}
        </div>

        <div class="card">
            <h3 style="margin-bottom:20px;">Revenue by Venue</h3>
            ${Object.keys(byVenue).length === 0
                ? `<div class="empty-state"><i class="fa-solid fa-chart-bar"></i><h3>No Data</h3><p>Add reservations to see revenue breakdown</p></div>`
                : Object.entries(byVenue).sort((a,b) => b[1].revenue - a[1].revenue).map(([venue, data]) => `
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                    <div>
                        <div style="font-weight:700;font-size:14px;">${venue}</div>
                        <div style="font-size:12px;color:var(--text-muted);">${data.count} booking(s)</div>
                    </div>
                    <div style="color:var(--primary);font-weight:700;">${formatCurrency(data.revenue)}</div>
                </div>
            `).join('')}
        </div>
    </div>`;
}

function renderSettings(c) {
    c.innerHTML = `
    <div class="card" style="margin-bottom:24px;">
        <div class="section-header">
            <div>
                <h2><i class="fa-solid fa-gear" style="color:var(--primary);margin-right:10px;"></i>System Settings</h2>
                <p>Configure the Reservation Module</p>
            </div>
        </div>
        <div style="max-width:600px;">
            <div class="form-group"><label>Business Name</label><input type="text" value="${store.data.settings.business_name}" id="set_name"></div>
            <div class="form-group"><label>Currency Symbol</label><input type="text" value="${store.data.settings.currency_symbol}" id="set_currency" style="max-width:100px;"></div>
            <div class="form-group"><label>Default Reservation Status</label>
                <select id="set_default_status"><option value="Pending">Pending</option><option value="Confirmed" selected>Confirmed</option></select>
            </div>
            <div style="display:flex;gap:12px;">
                <button class="btn btn-primary" onclick="saveSettings()">
                    <i class="fa-solid fa-floppy-disk" style="margin-right:8px;"></i>Save Settings
                </button>
            </div>
        </div>
    </div>

    <div class="card">
        <h3 style="margin-bottom:20px;"><i class="fa-solid fa-database" style="color:var(--primary);margin-right:10px;"></i>Database & Connections</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px;">
            <div style="padding:16px;border:1px solid var(--glass-border);border-radius:16px;">
                <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">POS Module</div>
                <div style="font-weight:700;color:var(--primary);">http://localhost:301</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Shared SQLite database</div>
            </div>
            <div style="padding:16px;border:1px solid var(--primary);border-radius:16px;background:var(--primary-light);">
                <div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">Reservation Module</div>
                <div style="font-weight:700;color:var(--primary);">http://localhost:302</div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px;">Active — pos_data.db</div>
            </div>
        </div>
        <div style="display:flex;gap:12px;">
            <a href="http://localhost:301" target="_blank" class="btn btn-outline">
                <i class="fa-solid fa-cash-register" style="margin-right:8px;"></i>Open POS Module
            </a>
            <button class="btn btn-outline" onclick="store.refreshData().then(()=>showToast('All data synced from pos_data.db ✓','success'))">
                <i class="fa-solid fa-rotate-right" style="margin-right:8px;"></i>Force DB Sync
            </button>
        </div>
        <p style="margin-top:16px;color:var(--text-muted);font-size:13px;">
            <i class="fa-solid fa-circle-info" style="color:var(--primary);margin-right:6px;"></i>
            Both modules share the same <code style="color:var(--primary);">pos_data.db</code> SQLite file. All CRUD operations are persisted in real-time.
        </p>
    </div>`;
}

async function saveSettings() {
    const businessName = $('set_name').value.trim();
    const currencySymbol = $('set_currency').value.trim();
    if (!businessName) { showToast('Business name cannot be empty', 'danger'); return; }
    try {
        await store.fetchAPI('/settings', {
            method: 'PUT',
            body: JSON.stringify({ business_name: businessName, currency_symbol: currencySymbol })
        });
        showToast('Settings saved successfully ✓', 'success');
        await store.refreshData();
        navigate('/settings');
    } catch (err) {
        showToast('Failed to save settings: ' + err.message, 'danger');
    }
}
