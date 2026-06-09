/**
 * App Version: 1.2.0 (Stable delegation)
 * Last Updated: 2026-05-10
 */
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'fa-check-circle';
    if (type === 'error') icon = 'fa-circle-xmark';
    if (type === 'warning') icon = 'fa-triangle-exclamation';
    
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.validatePhone = (phone) => {
    return /^[0-9+-\s]{7,15}$/.test(phone);
};

window.markInvalid = function(elementId) {
    const el = document.getElementById(elementId);
    if (el) {
        el.classList.add('invalid');
        el.addEventListener('input', () => el.classList.remove('invalid'), { once: true });
    }
};

window.clearValidations = function(containerSelector) {
    const container = document.querySelector(containerSelector) || document;
    container.querySelectorAll('.invalid').forEach(el => el.classList.remove('invalid'));
};

window.showConfirm = function(title, message, onConfirm, type = 'primary', showInput = false, inputPlaceholder = '') {
    const color = type === 'danger' ? '#ef4444' : 'var(--primary)';
    const btnClass = type === 'danger' ? 'btn-danger' : 'btn-primary';
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px; text-align: center;">
            <i class="fa-solid fa-circle-question" style="font-size: 48px; color: ${color}; margin-bottom: 24px; display: block;"></i>
            <h3>${title}</h3>
            <p style="color: var(--text-muted); margin-bottom: 24px; font-size: 15px; line-height: 1.5;">${message}</p>
            
            ${showInput ? `
                <div class="form-group" style="text-align: left; margin-bottom: 24px;">
                    <label style="font-size: 11px;">Reason for Action</label>
                    <textarea id="confirmInput" placeholder="${inputPlaceholder}" style="width: 100%; height: 80px; border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-family: inherit; font-size: 14px;"></textarea>
                    <div id="confirmInputError" style="color: #ef4444; font-size: 11px; margin-top: 4px; display: none;">Reason is required to proceed.</div>
                </div>
            ` : ''}

            <div class="modal-actions">
                <button type="button" class="btn btn-outline" id="confirmCancel">Cancel</button>
                <button type="button" class="btn ${btnClass}" id="confirmOk">Confirm</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    
    document.getElementById('confirmCancel').onclick = () => modal.remove();
    document.getElementById('confirmOk').onclick = () => { 
        if (showInput) {
            const val = document.getElementById('confirmInput').value.trim();
            if (!val) {
                document.getElementById('confirmInputError').style.display = 'block';
                document.getElementById('confirmInput').style.borderColor = '#ef4444';
                return;
            }
            onConfirm(val);
        } else {
            onConfirm(); 
        }
        modal.remove(); 
    };
};

document.addEventListener('DOMContentLoaded', () => {
    const appView = document.getElementById('app-view');
    const navItems = document.querySelectorAll('.sidebar-nav .nav-item');

    // Routing Logic
    const routes = {
        '/login': renderLogin,
        '/dashboard': renderDashboard,
        '/order-line': renderOrderLine,
        '/history': renderHistory,
        '/tables': renderTables,
        '/dishes': renderDishes,
        '/customers': renderCustomers,
        '/users': renderUsers,
        '/kitchen': renderKitchen,
        '/serving': renderServing,
        '/settings': renderSettings,
        '/help': renderHelp
    };

    const roleAccess = {
        'admin': ['/dashboard', '/order-line', '/serving', '/history', '/tables', '/dishes', '/customers', '/users', '/kitchen', '/settings', '/help'],
        'manager': ['/dashboard', '/order-line', '/serving', '/history', '/tables', '/dishes', '/customers', '/kitchen', '/help'],
        'cashier': ['/order-line', '/serving', '/history', '/tables', '/customers'],
        'waiter': ['/order-line', '/serving', '/tables'],
        'kitchen': ['/kitchen']
    };

    // Socket.io for Real-time Kitchen Updates
    const socket = io();

    socket.on('new_order', (order) => {
        // Play notification sound
        try {
            const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
            audio.play().catch(e => console.log("Sound play blocked", e));
        } catch(e) {}

        // If we are currently on the kitchen view, we should re-render or add the ticket
        if (window.location.hash.includes('/kitchen')) {
            store.data.orders.unshift(order);
            handleRoute(); // brute force re-render for simplicity
        } else {
            // Update notification badge
            const badge = document.querySelector('.notification-btn .badge');
            if(badge) badge.style.display = 'block';
        }
    });

    socket.on('order_updated', (data) => {
        const order = store.data.orders.find(o => o.id === data.id);
        if (order) order.status = data.status;
        
        if (data.status === 'Ready' && ['waiter', 'admin', 'manager'].includes(store.data.currentUser.role)) {
            // Auto-navigate to serving if they aren't busy taking an order
            if (store.data.cart.length === 0) {
                window.location.hash = '#/serving';
            } else {
                window.showToast(`Order ${data.id} is Ready! Check the Serving tab.`, 'success');
            }
        } else if (data.status === 'Ready' && store.data.currentUser.role !== 'kitchen') {
            window.showToast(`Order ${data.id} is Ready!`, 'success');
        }

        if (window.location.hash.includes('/kitchen') || window.location.hash.includes('/dashboard') || window.location.hash.includes('/serving')) {
            handleRoute(); 
        }
    });

    function handleRoute() {
        let hash = window.location.hash.replace('#', '');
        const user = store.data.currentUser;

        // Force login if not authenticated
        if (!user) {
            hash = '/login';
            window.location.hash = '#/login';
        } else if (hash === '/login' || !hash) {
            // Redirect to home route based on role if they hit root or login while authenticated
            hash = user.role === 'kitchen' ? '/kitchen' : (user.role === 'admin' ? '/dashboard' : '/order-line');
            window.location.hash = '#' + hash;
        }

        // Check RBAC Authorization
        if (user && hash !== '/login' && !roleAccess[user.role].includes(hash)) {
            const fallback = user.role === 'kitchen' ? '/kitchen' : (user.role === 'admin' ? '/dashboard' : '/order-line');
            window.location.hash = '#' + fallback;
            return; // Will re-trigger hashchange
        }

        // Layout visibility (Hide sidebar/topbar on login)
        const sidebar = document.getElementById('sidebar');
        const topbar = document.querySelector('.topbar');
        if (hash === '/login') {
            if(sidebar) sidebar.style.display = 'none';
            if(topbar) topbar.style.display = 'none';
        } else {
            if(sidebar) sidebar.style.display = 'flex';
            if(topbar) topbar.style.display = 'flex';
            
            // Update Topbar Profile Name
            const userNameEl = document.querySelector('.user-name');
            const userRoleEl = document.querySelector('.user-role');
            if(userNameEl) userNameEl.textContent = user.name;
            if(userRoleEl) userRoleEl.textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);

            // Filter Sidebar Links
            navItems.forEach(item => {
                const route = item.getAttribute('data-route');
                if (roleAccess[user.role].includes(route)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
                
                // Update active state
                if (route === hash) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
        }
        // Update Navigation Badges
        const updateNavBadges = () => {
            const readyCount = store.data.orders.filter(o => o.status === 'Ready').length;
            const prepCount = store.data.orders.filter(o => o.status === 'Preparing').length;
            
            navItems.forEach(item => {
                const route = item.getAttribute('data-route');
                let badge = item.querySelector('.nav-badge');
                
                if (route === '/serving' && readyCount > 0) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'nav-badge';
                        badge.style = 'background:#00f2fe; color:#000; font-size:10px; font-weight:800; padding:2px 8px; border-radius:10px; margin-left:auto; box-shadow:0 0 10px rgba(0,242,254,0.4);';
                        item.appendChild(badge);
                    }
                    badge.textContent = readyCount;
                } else if (route === '/kitchen' && prepCount > 0) {
                    if (!badge) {
                        badge = document.createElement('span');
                        badge.className = 'nav-badge';
                        badge.style = 'background:#f59e0b; color:#000; font-size:10px; font-weight:800; padding:2px 8px; border-radius:10px; margin-left:auto; box-shadow:0 0 10px rgba(245,158,11,0.4);';
                        item.appendChild(badge);
                    }
                    badge.textContent = prepCount;
                } else if (badge) {
                    badge.remove();
                }
            });
        };
        updateNavBadges();

        // Render View
        const renderer = routes[hash];
        if (renderer) {
            appView.innerHTML = '';
            // Network Status Indicator
            const onlineBadge = document.getElementById('onlineStatus');
            if (onlineBadge) {
                onlineBadge.style = `
                    padding: 8px 16px; border-radius: 50px; font-size: 11px; font-weight: 800;
                    background: ${store.data.isOnline ? 'rgba(0, 242, 254, 0.1)' : 'rgba(239, 68, 68, 0.1)'};
                    color: ${store.data.isOnline ? 'var(--primary)' : '#ef4444'};
                    display: flex; align-items: center; gap: 8px;
                    border: 1px solid ${store.data.isOnline ? 'rgba(0, 242, 254, 0.2)' : 'rgba(239, 68, 68, 0.2)'};
                    letter-spacing: 0.5px;
                `;
                onlineBadge.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:currentColor; box-shadow: 0 0 10px currentColor;"></span> ${store.data.isOnline ? 'ONLINE' : 'OFFLINE MODE'}`;
            }

            window.addEventListener('network_status_change', () => {
                const badge = document.getElementById('onlineStatus');
                if (badge) {
                    badge.style.background = store.data.isOnline ? 'rgba(0, 242, 254, 0.1)' : 'rgba(239, 68, 68, 0.1)';
                    badge.style.color = store.data.isOnline ? 'var(--primary)' : '#ef4444';
                    badge.style.border = `1px solid ${store.data.isOnline ? 'rgba(0, 242, 254, 0.2)' : 'rgba(239, 68, 68, 0.2)'}`;
                    badge.innerHTML = `<span style="width:8px; height:8px; border-radius:50%; background:currentColor; box-shadow: 0 0 10px currentColor;"></span> ${store.data.isOnline ? 'ONLINE' : 'OFFLINE MODE'}`;
                }
            });

            renderer(appView);
        } else {
            appView.innerHTML = `<h2>Page Not Found</h2>`;
        }
    }

    // Sync Brand Identity across UI
    const syncBrand = () => {
        const settings = store.data.settings || {};
        const name = settings.business_name || 'TASTY OF ASCENDIA';
        
        // Update Sidebar
        const sidebarLogo = document.querySelector('.logo-text');
        if (sidebarLogo) {
            const [first, ...rest] = name.split(' ');
            sidebarLogo.innerHTML = `<h2>${first}</h2><p>${rest.join(' ')}</p>`;
        }
        
        // Update Tab Title
        document.title = `${name} - POS System`;
        
        // Update Login Screen if it's currently rendered
        const loginMain = document.querySelector('.brand-main');
        if (loginMain) {
            const [first, ...rest] = name.split(' ');
            loginMain.textContent = rest.join(' ') || first;
            const loginTop = document.querySelector('.brand-top');
            if (loginTop) loginTop.textContent = rest.length > 0 ? first : '';
        }
    };

    // Wait for store to fetch data from backend
    window.addEventListener('store_ready', async () => {
        // Load Settings on start
        try {
            const res = await store.fetchAPI('/settings');
            store.data.settings = await res.json();
            syncBrand();
        } catch (e) { console.error('Failed to load settings:', e); }

        // Bind Logout
        const logoutBtn = document.querySelector('.logout');
        if(logoutBtn) {
            logoutBtn.addEventListener('click', (e) => {
                e.preventDefault();
                store.logout();
                window.location.hash = '#/login';
            });
        }

        window.addEventListener('hashchange', handleRoute);
        handleRoute(); // initial call
    });

    // --- View Renderers ---

    function renderLogin(container) {
        if (!document.getElementById('login-css')) {
            const link = document.createElement('link');
            link.id = 'login-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/login.css';
            document.head.appendChild(link);
        }

        container.innerHTML = `
            <div class="login-layout">
                <div class="login-card">
                    <div class="login-logo">
                        <div class="logo-icon"><i class="fa-solid fa-bowl-food"></i></div>
                        <div class="logo-text">
                            <span class="brand-top">Tasty of</span>
                            <span class="brand-main">Ascendia</span>
                        </div>
                    </div>
                    <form class="login-form" id="loginForm">
                        <div class="login-error" id="loginError"></div>
                        <div class="form-group">
                            <label>Username</label>
                            <input type="text" id="username" placeholder="Enter your username" required>
                        </div>
                        <div class="form-group">
                            <label>Password</label>
                            <input type="password" id="password" placeholder="Enter your password" required>
                        </div>
                        <button type="submit" class="btn btn-primary btn-login">Login</button>
                    </form>
                    <div style="margin-top:24px; text-align:center; font-size:11px; color:rgba(255,255,255,0.3); letter-spacing:0.4px;">
                        &copy; 2026 All Rights Reserved. <span style="color:rgba(0,242,254,0.5); font-weight:600;">Ascendia Solutions.</span>
                    </div>
                </div>
            </div>
        `;

        const form = document.getElementById('loginForm');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            window.clearValidations('#loginForm');
            const u = document.getElementById('username');
            const p = document.getElementById('password');
            const errDiv = document.getElementById('loginError');
            
            if (!u.value.trim()) {
                window.markInvalid('username');
                errDiv.textContent = "Username is required";
                errDiv.style.display = 'block';
                return;
            }
            if (!p.value.trim()) {
                window.markInvalid('password');
                errDiv.textContent = "Password is required";
                errDiv.style.display = 'block';
                return;
            }

            const res = await store.login(u.value.trim(), p.value);
            if (res.success) {
                handleRoute(); 
            } else {
                errDiv.textContent = res.error;
                errDiv.style.display = 'block';
            }
        });
    }

    async function renderDashboard(container) {
        if (!document.getElementById('dashboard-css')) {
            const link = document.createElement('link');
            link.id = 'dashboard-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/dashboard.css';
            document.head.appendChild(link);
        }

        container.innerHTML = `
            <div style="padding:40px; display:flex; flex-direction:column; align-items:center; gap:20px;">
                <div class="status-pulse" style="width:40px; height:40px; background:var(--primary); border-radius:50%;"></div>
                <div style="font-weight:600; color:var(--text-muted);">Syncing Enterprise Data...</div>
            </div>
        `;
        
        try {
            const res = await store.fetchAPI('/analytics');
            const data = await res.json();
            
            // Defensive data checks
            const popularity = data.popularity || [];
            const weeklyTrends = data.weeklyTrends || [];
            const peakHours = data.peakHours || [];
            const lowStockAlerts = data.lowStockAlerts || [];
            const currency = store.data.settings.currency_symbol || 'Rs.';

            // Calculate Sales Trend (Simplified)
            const trend = weeklyTrends.length >= 2 
                ? (((weeklyTrends[0].revenue - weeklyTrends[1].revenue) / weeklyTrends[1].revenue) * 100).toFixed(1)
                : 0;

            container.innerHTML = `
                <div class="dashboard-layout">
                    <div class="dash-header">
                        <div>
                            <h2 style="font-size:28px; font-weight:800; letter-spacing:-0.5px;">Business Intelligence</h2>
                            <p style="color:var(--text-muted); font-size:15px;">Real-time performance analytics for your restaurant.</p>
                        </div>
                        <div style="display:flex; gap:12px;">
                            ${lowStockAlerts.length > 0 ? `
                                <div style="background:rgba(239, 68, 68, 0.1); color:#ef4444; border:1px solid rgba(239, 68, 68, 0.2); padding:10px 20px; border-radius:14px; display:flex; align-items:center; gap:10px; font-weight:700; font-size:12px;">
                                    <i class="fa-solid fa-triangle-exclamation"></i> ${lowStockAlerts.length} STOCK ALERTS
                                </div>
                            ` : ''}
                        </div>
                    </div>

                    <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
                        <!-- Revenue Card -->
                        <div class="stat-card" style="background:linear-gradient(135deg, rgba(0, 242, 254, 0.1) 0%, rgba(0,0,0,0) 100%); border-left:4px solid var(--primary);">
                            <div class="stat-icon" style="background:var(--primary); color:#000;"><i class="fa-solid fa-dollar-sign"></i></div>
                            <div class="stat-info">
                                <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:4px;">Overall Revenue</h4>
                                <div class="stat-value" style="font-size:32px;">${currency}${Number(data.totalRevenue).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                <div class="stat-trend ${trend >= 0 ? 'positive' : 'negative'}" style="font-size:13px; font-weight:700; display:flex; align-items:center; gap:4px; margin-top:4px;">
                                    <i class="fa-solid fa-arrow-trend-${trend >= 0 ? 'up' : 'down'}"></i> ${trend}% <span style="font-weight:500; opacity:0.7;">vs last week</span>
                                </div>
                            </div>
                        </div>

                        <!-- Daily Volume -->
                        <div class="stat-card" style="background:linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(0,0,0,0) 100%); border-left:4px solid #6366f1;">
                            <div class="stat-icon" style="background:#6366f1; color:#fff;"><i class="fa-solid fa-chart-simple"></i></div>
                            <div class="stat-info">
                                <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:4px;">Today's Sales</h4>
                                <div class="stat-value" style="font-size:32px;">${currency}${Number(data.todayRevenue).toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                                <div style="font-size:13px; color:#6366f1; font-weight:700; margin-top:4px; display:flex; align-items:center; gap:6px;">
                                    <span style="width:6px; height:6px; border-radius:50%; background:#6366f1; animation:pulse 2s infinite;"></span> LIVE TRACKING
                                </div>
                            </div>
                        </div>

                        <!-- Customers -->
                        <div class="stat-card" style="background:linear-gradient(135deg, rgba(245, 158, 11, 0.1) 0%, rgba(0,0,0,0) 100%); border-left:4px solid #f59e0b;">
                            <div class="stat-icon" style="background:#f59e0b; color:#fff;"><i class="fa-solid fa-users"></i></div>
                            <div class="stat-info">
                                <h4 style="font-size:12px; text-transform:uppercase; letter-spacing:1px; color:var(--text-muted); margin-bottom:4px;">Customer Base</h4>
                                <div class="stat-value" style="font-size:32px;">${store.data.customers.length}</div>
                                <div style="font-size:13px; color:#f59e0b; font-weight:700; margin-top:4px;">
                                    LOYALTY MEMBERS
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="dash-bottom" style="margin-top:24px; display:grid; grid-template-columns: 1.8fr 1.2fr; gap:24px;">
                        <!-- Chart Area -->
                        <div class="card" style="padding:32px; background:var(--glass-bg); backdrop-filter:blur(20px); border-radius:24px;">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:32px;">
                                <div>
                                    <h3 style="font-size:18px; font-weight:700;">Sales Performance</h3>
                                    <p style="font-size:13px; color:var(--text-muted);">Revenue trends over the last 14 days</p>
                                </div>
                                <div style="padding:8px 16px; background:rgba(255,255,255,0.05); border-radius:12px; font-size:12px; font-weight:700; color:var(--primary);">
                                    <i class="fa-solid fa-calendar-days"></i> 14 DAY VIEW
                                </div>
                            </div>
                            <div style="height:350px;">
                                <canvas id="revenueChart"></canvas>
                            </div>
                        </div>
                        
                        <div style="display:flex; flex-direction:column; gap:24px;">
                            <!-- Popularity Matrix -->
                            <div class="card" style="padding:28px; background:var(--glass-bg); backdrop-filter:blur(20px); border-radius:24px;">
                                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:24px;">
                                    <h3 style="font-size:18px; font-weight:700;">Top Performers</h3>
                                    <i class="fa-solid fa-crown" style="color:#f59e0b;"></i>
                                </div>
                                <div style="display:flex; flex-direction:column; gap:16px;">
                                    ${popularity.map((item, idx) => {
                                        const maxRev = Math.max(...popularity.map(p => p.revenue), 1);
                                        const percentage = (item.revenue / maxRev) * 100;
                                        return `
                                            <div style="display:grid; gap:8px;">
                                                <div style="display:flex; justify-content:space-between; align-items:center;">
                                                    <div style="font-weight:700; font-size:14px; display:flex; align-items:center; gap:10px;">
                                                        <span style="width:24px; height:24px; display:flex; align-items:center; justify-content:center; background:rgba(255,255,255,0.05); border-radius:6px; font-size:11px; color:var(--text-muted);">${idx + 1}</span>
                                                        ${item.name}
                                                    </div>
                                                    <div style="font-weight:800; color:var(--primary); font-size:14px;">${currency}${(item.revenue || 0).toFixed(2)}</div>
                                                </div>
                                                <div style="height:6px; background:rgba(255,255,255,0.05); border-radius:10px; overflow:hidden;">
                                                    <div style="height:100%; width:${percentage}%; background:linear-gradient(90deg, var(--primary) 0%, #6366f1 100%); border-radius:10px;"></div>
                                                </div>
                                                <div style="font-size:11px; color:var(--text-muted); font-weight:500;">${item.units_sold} orders today</div>
                                            </div>
                                        `;
                                    }).slice(0, 5).join('')}
                                </div>
                            </div>

                            <!-- Operational Insights -->
                            <div class="card" style="padding:28px; background:var(--glass-bg); backdrop-filter:blur(20px); border-radius:24px;">
                                <h3 style="font-size:18px; font-weight:700; margin-bottom:24px;">Operational Health</h3>
                                <div style="display:flex; flex-direction:column; gap:20px;">
                                    <div style="display:flex; align-items:center; gap:16px;">
                                        <div style="width:44px; height:44px; background:rgba(0, 242, 254, 0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; color:var(--primary); font-size:18px;">
                                            <i class="fa-solid fa-clock"></i>
                                        </div>
                                        <div>
                                            <div style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Avg Prep Time</div>
                                            <div style="font-weight:800; font-size:18px; color:var(--text-main);">14.2 min <span style="font-size:12px; color:#10b981; font-weight:600;"><i class="fa-solid fa-caret-down"></i> 2.1m</span></div>
                                        </div>
                                    </div>
                                    <div style="display:flex; align-items:center; gap:16px;">
                                        <div style="width:44px; height:44px; background:rgba(99, 102, 241, 0.1); border-radius:12px; display:flex; align-items:center; justify-content:center; color:#6366f1; font-size:18px;">
                                            <i class="fa-solid fa-utensils"></i>
                                        </div>
                                        <div>
                                            <div style="font-size:12px; color:var(--text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Table Turnover</div>
                                            <div style="font-weight:800; font-size:18px; color:var(--text-main);">48 min <span style="font-size:12px; color:#ef4444; font-weight:600;"><i class="fa-solid fa-caret-up"></i> 4m</span></div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            
            const ctx = document.getElementById('revenueChart').getContext('2d');
            
            // Create Gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 350);
            gradient.addColorStop(0, 'rgba(0, 242, 254, 0.2)');
            gradient.addColorStop(1, 'rgba(0, 242, 254, 0)');

            new Chart(ctx, {
                type: 'line',
                data: {
                    labels: [...weeklyTrends].reverse().map(t => new Date(t.date).toLocaleDateString([], {month: 'short', day: 'numeric'})),
                    datasets: [{
                        label: 'Daily Revenue',
                        data: [...weeklyTrends].reverse().map(t => t.revenue),
                        borderColor: '#00f2fe',
                        backgroundColor: gradient,
                        borderWidth: 4,
                        fill: true,
                        tension: 0.4,
                        pointRadius: 6,
                        pointHoverRadius: 8,
                        pointBackgroundColor: '#00f2fe',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { 
                        legend: { display: false },
                        tooltip: {
                            backgroundColor: '#111827',
                            titleColor: '#9ca3af',
                            bodyColor: '#fff',
                            bodyFont: { weight: 'bold', size: 14 },
                            padding: 12,
                            borderRadius: 10,
                            displayColors: false,
                            callbacks: {
                                label: (context) => `${currency}${context.parsed.y.toLocaleString()}`
                            }
                        }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: { color: 'rgba(255,255,255,0.05)', drawBorder: false },
                            ticks: { color: '#9ca3af', font: { size: 11, weight: '600' } }
                        },
                        x: { 
                            grid: { display: false },
                            ticks: { color: '#9ca3af', font: { size: 11, weight: '600' } }
                        }
                    }
                }
            });
            
        } catch(e) {
            console.error(e);
            container.innerHTML = `<div style="padding:40px; color:red;">Failed to load Business Intelligence data. ${e.message}</div>`;
        }
    }

    function renderOrderLine(container) {
        if (!document.getElementById('order-line-css')) {
            const link = document.createElement('link');
            link.id = 'order-line-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/order-line.css';
            document.head.appendChild(link);
        }

        const categories = store.getCategories();
        let activeCategory = 'all';
        let modalDish = null;
        let modalMode = 'add';
        let modalQty = 1;
        const currency = store.data.settings.currency_symbol || 'Rs.';

        // 1. Render Main Layout Shell
        container.innerHTML = `
            <div class="order-layout">
                <div class="order-main">
                    <div class="order-categories-scroll"></div>
                    <div class="order-grid"></div>
                </div>
                <div class="order-cart-panel">
                    <div class="cart-header">
                        <h3>Current Order</h3>
                        <span class="cart-order-id">#ORD-${Math.floor(1000 + Math.random() * 9000)}</span>
                    </div>
                    <div class="cart-actions">
                        <button class="cart-action-btn" id="selectTableBtn">
                            <i class="fa-solid fa-chair"></i> Table
                        </button>
                        <button class="cart-action-btn" id="selectCustBtn">
                            <i class="fa-solid fa-user"></i> Customer
                        </button>
                    </div>
                    <div class="cart-items"></div>
                    <div class="cart-summary">
                        <div class="summary-row"><span>Subtotal</span><span class="summary-subtotal">${currency}0.00</span></div>
                        <div class="summary-row"><span>Tax (10%)</span><span class="summary-tax">${currency}0.00</span></div>
                        <div class="summary-total"><span>Total</span><span class="summary-total-val">${currency}0.00</span></div>
                        <div class="order-type-toggle">
                            <button class="type-btn active" data-type="Dine In">Dine In</button>
                            <button class="type-btn" data-type="Takeaway">Takeaway</button>
                        </div>
                        <button class="btn btn-primary checkout-btn"><i class="fa-solid fa-wallet"></i> Pay Now</button>
                    </div>
                </div>
            </div>
            <!-- Modals (itemModal, paymentModal, receiptModal) -->
            <div id="orderModalsContainer"></div>
        `;

        // Inject Modals into a dedicated container to avoid clearing them
        const modalsContainer = container.querySelector('#orderModalsContainer');
        modalsContainer.innerHTML = `
            <div id="itemModal" class="modal-overlay" style="display:none;">
                <div class="modal-content" style="max-width: 400px; text-align: center;">
                    <h3 id="itemModalTitle" style="margin-bottom: 8px;">Add Item</h3>
                    <img id="itemModalImg" src="" style="width: 120px; height: 120px; border-radius: 50%; object-fit: cover; margin: 0 auto 16px;">
                    <h4 id="itemModalName" style="font-size: 18px; margin-bottom: 4px;"></h4>
                    <div id="itemModalPrice" style="color: var(--primary); font-weight: 600; font-size: 16px; margin-bottom: 24px;"></div>
                    <div style="background: rgba(0,0,0,0.03); padding: 15px; border-radius: 50px; display: inline-flex; align-items: center; justify-content: center; gap: 30px; margin-bottom: 30px; border: 1px solid rgba(0,0,0,0.02);">
                        <button id="itemModalMinus" class="btn-qty"><i class="fa-solid fa-minus"></i></button>
                        <span id="itemModalQty" style="font-size: 32px; font-weight: 800; min-width: 40px;">1</span>
                        <button id="itemModalPlus" class="btn-qty"><i class="fa-solid fa-plus"></i></button>
                    </div>
                    <div class="modal-actions">
                        <button type="button" class="btn btn-outline" id="closeItemModal" style="border-radius: 20px;">Cancel</button>
                        <button type="button" class="btn btn-primary" id="saveItemModalBtn" style="border-radius: 20px;">Add to Cart</button>
                    </div>
                    <div id="removeItemContainer" style="margin-top: 12px; display: none;">
                        <button type="button" class="btn" id="removeItemModalBtn" style="color: #ef4444; background: none; text-decoration: underline;">Remove Item</button>
                    </div>
                </div>
            </div>

            <div id="paymentModal" class="modal-overlay" style="display:none;">
                <div class="modal-content" style="width: 480px;">
                    <h3>Finalize Payment</h3>
                    <div class="payment-total-box" style="background:var(--primary-light); padding:20px; border-radius:12px; text-align:center; margin:24px 0;">
                        <span id="paymentModalTotal" style="font-size:32px; font-weight:800; color:var(--primary);">${currency}0.00</span>
                    </div>
                    <div class="payment-options" style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; margin-bottom:20px;">
                        <button class="payment-opt-btn active" data-method="Cash"><span>CASH</span></button>
                        <button class="payment-opt-btn" data-method="Card"><span>CARD</span></button>
                        <button class="payment-opt-btn" data-method="QR"><span>QR PAYMENTS</span></button>
                    </div>
                    <div id="paymentDetailsArea" style="display:none; margin-bottom:20px;">
                        <div id="cardFields" style="display:none;">
                            <input type="text" id="cardNameInput" placeholder="Card Name" style="width:100%; padding:12px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:12px; background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;">
                            <input type="text" id="cardNumInput" placeholder="Card Number (16 digits)" style="width:100%; padding:12px; border:1px solid var(--border-color); border-radius:8px; margin-bottom:12px; background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;" maxlength="19">
                            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
                                <input type="text" id="cardExpiryInput" placeholder="Expiry Date (MM/YY)" style="width:100%; padding:12px; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;" maxlength="5">
                                <input type="text" id="cardCVVInput" placeholder="CVV" style="width:100%; padding:12px; border:1px solid var(--border-color); border-radius:8px; background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;" maxlength="4">
                            </div>
                        </div>
                        <div id="qrFields" style="display:none;">
                            <div class="qr-code-area">
                                <img src="assets/images/payment_qr.png" alt="Payment QR Code" class="qr-code-img">
                                <span class="qr-instruction">Scan this code with your banking app to pay.</span>
                            </div>
                        </div>
                    </div>
                    <div class="modal-actions">
                        <button class="btn btn-outline" id="closePaymentModal">Cancel</button>
                        <button class="btn btn-primary" id="completePaymentBtn">Complete Payment</button>
                    </div>
                </div>
            </div>

            <div id="receiptModal" class="modal-overlay" style="display:none;">
                <div class="modal-content" style="width: 380px;">
                    <div id="receiptContent" style="background:white; padding:20px; color:black; font-family:monospace;">
                        <div style="text-align:center;">
                            <h2>TASTY OF ASCENDIA</h2>
                            <div style="font-size:11px; color:#555;">123 Culinary Ave, Foodville</div>
                        </div>
                        <div class="receipt-info" style="margin:15px 0; font-size:12px; display:grid; grid-template-columns: 1fr 1fr; gap:5px;">
                            <div>Date: <span id="receiptDate"></span></div>
                            <div>Order ID: <span id="receiptOrderId"></span></div>
                            <div>Type: <span id="receiptOrderType"></span></div>
                            <div>Target: <span id="receiptTarget"></span></div>
                            <div>Payment: <span id="receiptPayment"></span></div>
                        </div>
                        <div id="receiptItems" style="margin:10px 0; border-top:1px dashed #ccc; padding-top:10px; font-size:12px;"></div>
                        <div style="border-top:1px dashed #ccc; padding-top:10px; font-size:12px;">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Subtotal:</span> <span id="receiptSubtotal"></span></div>
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>Tax (10%):</span> <span id="receiptTax"></span></div>
                        </div>
                        <div style="border-top:1px dashed #ccc; padding-top:10px; font-weight:bold; font-size:14px; display:flex; justify-content:space-between;">
                            <span>Total:</span> <span id="receiptTotal"></span>
                        </div>
                        <div style="text-align:center; margin-top:20px; font-size:11px; color:#555;">
                            Thank you for dining with us!
                        </div>
                    </div>
                    <div class="modal-actions" style="display:grid; gap:10px; margin-top:20px;">
                        <button class="btn btn-primary" id="sendToKitchenBtn">Send Order in to the kitchen</button>
                        <button class="btn btn-primary" id="shareMobileBtn">Send Receipt to Mobile</button>
                        <button class="btn btn-outline" id="printReceiptBtn">Print Receipt</button>
                        <button class="btn btn-primary" id="closeReceiptBtn">New Order</button>
                    </div>
                </div>
            </div>
        `;

        // 2. Local View Functions
        const updateCartView = () => {
            const cartItems = store.data.cart;
            const container_items = container.querySelector('.cart-items');
            
            if (cartItems.length === 0) {
                container_items.innerHTML = '<div class="cart-empty">Cart is empty</div>';
                container.querySelector('.summary-subtotal').textContent = currency + '0.00';
                container.querySelector('.summary-tax').textContent = currency + '0.00';
                container.querySelector('.summary-total-val').textContent = currency + '0.00';
                return;
            }

            container_items.innerHTML = cartItems.map(item => `
                <div class="cart-item" data-id="${item.dish.id}">
                    <img src="${item.dish.image}" class="cart-item-img">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.dish.name}</div>
                        <div class="cart-item-price">${currency}${(item.dish.price * item.qty).toFixed(2)}</div>
                    </div>
                    <div class="cart-item-qty">x${item.qty}</div>
                </div>
            `).join('');

            const taxRate = 0.1; 
            const subtotal = cartItems.reduce((sum, item) => sum + (item.dish.price * item.qty), 0);
            const total = subtotal * (1 + taxRate);
            
            container.querySelector('.summary-subtotal').textContent = currency + subtotal.toFixed(2);
            container.querySelector('.summary-tax').textContent = currency + (subtotal * taxRate).toFixed(2);
            container.querySelector('.summary-total-val').textContent = currency + total.toFixed(2);

            // Re-bind item click in cart for edit
            container_items.querySelectorAll('.cart-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.getAttribute('data-id');
                    const item = store.data.cart.find(i => i.dish.id == id);
                    if (item) {
                        modalDish = item.dish;
                        modalMode = 'edit';
                        modalQty = item.qty;
                        openItemModal();
                    }
                });
            });
        };

        const renderCategories = () => {
            const catContainer = container.querySelector('.order-categories-scroll');
            catContainer.innerHTML = categories.map(cat => `
                <button class="order-cat-btn ${cat.id === activeCategory ? 'active' : ''}" data-id="${cat.id}">
                    <span>${cat.icon}</span> ${cat.name}
                </button>
            `).join('');

            catContainer.querySelectorAll('.order-cat-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    activeCategory = btn.getAttribute('data-id');
                    renderCategories();
                    renderGrid();
                });
            });
        };

        const renderGrid = () => {
            const dishes = store.getDishes(activeCategory);
            const grid = container.querySelector('.order-grid');
            grid.innerHTML = dishes.map(dish => `
                <div class="order-dish-card" data-dish='${JSON.stringify(dish)}'>
                    <img src="${dish.image}" class="order-dish-img">
                    <h4 class="order-dish-name">${dish.name}</h4>
                    <div class="order-dish-price">${currency}${dish.price.toFixed(2)}</div>
                </div>
            `).join('');

            grid.querySelectorAll('.order-dish-card').forEach(card => {
                card.addEventListener('click', () => {
                    modalDish = JSON.parse(card.getAttribute('data-dish'));
                    modalMode = 'add';
                    modalQty = 1;
                    openItemModal();
                });
            });
        };

        const openItemModal = () => {
            const modal = document.getElementById('itemModal');
            document.getElementById('itemModalTitle').textContent = modalMode === 'add' ? 'Add to Cart' : 'Edit Item';
            document.getElementById('itemModalImg').src = modalDish.image;
            document.getElementById('itemModalName').textContent = modalDish.name;
            document.getElementById('itemModalPrice').textContent = '$' + (modalDish.price * modalQty).toFixed(2);
            document.getElementById('itemModalQty').textContent = modalQty;
            document.getElementById('removeItemContainer').style.display = modalMode === 'edit' ? 'block' : 'none';
            modal.style.display = 'flex';
        };

        // 3. Bind Persistent Listeners (using global delegation for maximum stability)
        const handleGlobalClick = async (e) => {
            if (window.location.hash !== '#/order-line') return;
            
            const target = e.target.closest('button, .cart-item, .order-dish-card, .table-card, .cust-card');
            if (!target) return;

            console.log('Global Click Intercepted:', target.id || target.className);

            // Table Selection Button
            if (target.id === 'selectTableBtn') {
                if (store.data.currentOrderType === 'Takeaway') {
                    return window.showToast("Tables are only for Dine-In orders. Switch to Dine-In to select a table.", "warning");
                }
                const tables = store.data.tables;
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.style.display = 'flex';
                modal.innerHTML = `
                    <div class="modal-content" style="width: 500px;">
                        <h3>Select Table</h3>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; padding: 15px 0;">
                            ${tables.map(t => `
                                <div class="table-card ${t.status}" data-id="${t.id}" style="padding:15px; border:1px solid var(--glass-border); border-radius:12px; cursor:pointer; text-align:center; background:rgba(255,255,255,0.05); transition:background 0.2s;">
                                    <div style="font-weight:bold; color:var(--text-main); margin-bottom:5px;">${t.name}</div>
                                    <div style="font-size:11px; font-weight:600; color:${t.status === 'Available' ? 'var(--primary)' : '#ef4444'};">${t.status}</div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="modal-actions"><button class="btn btn-outline" id="closeTableModal" style="width:100%;">Cancel</button></div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelectorAll('.table-card').forEach(card => {
                    card.onclick = () => {
                        const id = card.getAttribute('data-id');
                        store.data.selectedTableId = id;
                        const table = tables.find(t => t.id == id);
                        const btn = document.getElementById('selectTableBtn');
                        if (btn) btn.innerHTML = `<i class="fa-solid fa-chair"></i> ${table.name}`;
                        modal.remove();
                    };
                });
                document.getElementById('closeTableModal').onclick = () => modal.remove();
            }

            // Customer Selection Button
            if (target.id === 'selectCustBtn') {
                const customers = store.data.customers;
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.style.display = 'flex';
                modal.innerHTML = `
                    <div class="modal-content" style="width: 400px;">
                        <h3>Select Customer</h3>
                        <div style="display:flex; gap:10px; margin-bottom:10px;">
                            <input type="text" id="searchCustInput" placeholder="Search by Mobile or Name..." style="flex:1; padding:10px; border-radius:8px; border:1px solid var(--border-color); background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;">
                            <button class="btn btn-primary" id="addNewCustBtn" style="white-space:nowrap;">+ Add New</button>
                        </div>
                        <div id="custSelectGrid" style="max-height:300px; overflow-y:auto; margin-bottom:20px;">
                            ${customers.map(c => `
                                <div class="cust-card" data-id="${c.id}" data-name="${c.name}" style="padding:12px; border-bottom:1px solid var(--border-color); cursor:pointer; display:flex; justify-content:space-between; align-items:center; transition:background 0.2s; border-radius:4px;">
                                    <strong style="color:var(--text-main);">${c.name}</strong>
                                    <span style="color:var(--text-muted); font-size:13px;"><i class="fa-solid fa-phone"></i> ${c.phone}</span>
                                </div>
                            `).join('')}
                        </div>
                        <div class="modal-actions"><button class="btn btn-outline" id="closeCustModal" style="width:100%;">Cancel</button></div>
                    </div>
                `;
                document.body.appendChild(modal);
                modal.querySelectorAll('.cust-card').forEach(card => {
                    card.onclick = () => {
                        store.data.selectedCustomerId = card.getAttribute('data-id');
                        const btn = document.getElementById('selectCustBtn');
                        if (btn) btn.innerHTML = `<i class="fa-solid fa-user"></i> ${card.getAttribute('data-name')}`;
                        modal.remove();
                    };
                    card.onmouseover = () => card.style.background = 'rgba(255,255,255,0.1)';
                    card.onmouseout = () => card.style.background = 'transparent';
                });

                document.getElementById('searchCustInput').addEventListener('input', (e) => {
                    const query = e.target.value.toLowerCase();
                    modal.querySelectorAll('.cust-card').forEach(card => {
                        const text = card.textContent.toLowerCase();
                        card.style.display = text.includes(query) ? 'flex' : 'none';
                    });
                });

                document.getElementById('closeCustModal').onclick = () => modal.remove();
                document.getElementById('addNewCustBtn').onclick = () => {
                    modal.remove();
                    const addModal = document.createElement('div');
                    addModal.className = 'modal-overlay';
                    addModal.style.display = 'flex';
                    addModal.innerHTML = `
                        <div class="modal-content">
                            <h3>New Customer</h3>
                            <input type="text" id="newCustName" placeholder="Name" style="width:100%; margin-bottom:10px; padding:12px; border-radius:8px; border:1px solid var(--border-color); background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;">
                            <input type="text" id="newCustPhone" placeholder="Phone Number (e.g. 555-1234)" style="width:100%; margin-bottom:20px; padding:12px; border-radius:8px; border:1px solid var(--border-color); background:rgba(255,255,255,0.05); color:var(--text-main); outline:none;">
                            <div class="modal-actions">
                                <button class="btn btn-outline" id="cancelAdd">Cancel</button>
                                <button class="btn btn-primary" id="saveAdd">Save & Select</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(addModal);
                    document.getElementById('cancelAdd').onclick = () => addModal.remove();
                    document.getElementById('saveAdd').onclick = async () => {
                        const name = document.getElementById('newCustName').value.trim();
                        const phone = document.getElementById('newCustPhone').value.trim();
                        if (name && window.validatePhone(phone)) {
                            const res = await store.fetchAPI('/customers', { method: 'POST', body: JSON.stringify({ name, phone }) });
                            const newC = await res.json();
                            store.data.customers.push(newC);
                            store.data.selectedCustomerId = newC.id;
                            const btn = document.getElementById('selectCustBtn');
                            if (btn) btn.innerHTML = `<i class="fa-solid fa-user"></i> ${name}`;
                            addModal.remove();
                        } else {
                            window.showToast("Invalid name or phone", "error");
                        }
                    };
                };
            }
            
            // Dish Card Click
            if (target.classList.contains('order-dish-card')) {
                modalDish = JSON.parse(target.getAttribute('data-dish'));
                modalMode = 'add';
                modalQty = 1;
                openItemModal();
            }

            // Cart Item Click
            if (target.classList.contains('cart-item')) {
                const id = target.getAttribute('data-id');
                const item = store.data.cart.find(i => i.dish.id == id);
                if (item) {
                    modalDish = item.dish;
                    modalMode = 'edit';
                    modalQty = item.qty;
                    openItemModal();
                }
            }

            // Checkout Button
            if (target.classList.contains('checkout-btn')) {
                if (store.data.cart.length === 0) return window.showToast("Cart is empty", "warning");
                if (store.data.currentOrderType === 'Dine In' && !store.data.selectedTableId) return window.showToast("Select Table", "error");
                if (!store.data.selectedCustomerId) return window.showToast("Select Customer", "error");
                
                document.getElementById('paymentModalTotal').textContent = document.querySelector('.summary-total-val').textContent;
                document.getElementById('paymentModal').style.display = 'flex';
            }

            // Order Type Toggle
            if (target.classList.contains('type-btn')) {
                const type = target.getAttribute('data-type');
                document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
                target.classList.add('active');
                store.data.currentOrderType = type;
                
                // If switching to Takeaway, clear table selection
                if (type === 'Takeaway') {
                    store.data.selectedTableId = null;
                    const btn = document.getElementById('selectTableBtn');
                    if (btn) btn.innerHTML = `<i class="fa-solid fa-chair"></i> Table`;
                }
            }
        };

        // Attach once to window
        window.onclick = handleGlobalClick;

        // Modal Specific Persistent Listeners (using global IDs)
        document.getElementById('itemModalPlus').onclick = () => {
            modalQty++;
            document.getElementById('itemModalQty').textContent = modalQty;
            document.getElementById('itemModalPrice').textContent = '$' + (modalDish.price * modalQty).toFixed(2);
        };
        document.getElementById('itemModalMinus').onclick = () => {
            if (modalQty > 1) modalQty--;
            document.getElementById('itemModalQty').textContent = modalQty;
            document.getElementById('itemModalPrice').textContent = '$' + (modalDish.price * modalQty).toFixed(2);
        };
        document.getElementById('closeItemModal').onclick = () => document.getElementById('itemModal').style.display = 'none';
        document.getElementById('saveItemModalBtn').onclick = () => {
            if (modalMode === 'add') store.addToCart(modalDish, modalQty);
            else store.updateCartQty(modalDish.id, modalQty);
            document.getElementById('itemModal').style.display = 'none';
            updateCartView();
        };
        document.getElementById('removeItemModalBtn').onclick = () => {
            store.removeFromCart(modalDish.id);
            document.getElementById('itemModal').style.display = 'none';
            updateCartView();
        };

        // Payment Modal
        const payModal = document.getElementById('paymentModal');
        payModal.onclick = (e) => {
            const btn = e.target.closest('.payment-opt-btn');
            if (btn) {
                payModal.querySelectorAll('.payment-opt-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const selectedMethod = btn.getAttribute('data-method');
                
                // Show/Hide specific detail areas
                document.getElementById('paymentDetailsArea').style.display = (selectedMethod === 'Card' || selectedMethod === 'QR') ? 'block' : 'none';
                document.getElementById('cardFields').style.display = selectedMethod === 'Card' ? 'block' : 'none';
                
                const qrFields = document.getElementById('qrFields');
                if (selectedMethod === 'QR') {
                    qrFields.style.display = 'block';
                    const totalVal = document.getElementById('paymentModalTotal').textContent;
                    
                    qrFields.innerHTML = `
                        <div class="qr-code-area">
                            <img src="assets/images/payment_qr.png" alt="Payment QR Code" class="qr-code-img">
                            <div style="color: #333; font-weight: 700; font-size: 18px; margin-bottom: 5px;">
                                Pay ${totalVal}
                            </div>
                            <span class="qr-instruction">Scan this code to complete payment</span>
                        </div>
                    `;
                } else {
                    qrFields.style.display = 'none';
                }
                
                payModal.setAttribute('data-selected-method', selectedMethod);
            }
        };
        document.getElementById('closePaymentModal').onclick = () => payModal.style.display = 'none';
        document.getElementById('completePaymentBtn').onclick = async () => {
            const method = payModal.getAttribute('data-selected-method') || 'Cash';
            
            // Validate Card Details
            if (method === 'Card') {
                const cNameInput = document.getElementById('cardNameInput');
                const cNumInput = document.getElementById('cardNumInput');
                const cExpInput = document.getElementById('cardExpiryInput');
                const cCVVInput = document.getElementById('cardCVVInput');
                
                const cName = cNameInput.value.trim();
                const cNum = cNumInput.value.replace(/\s/g, '');
                const cExp = cExpInput.value.trim();
                const cCVV = cCVVInput.value.trim();

                window.clearValidations('#paymentModal');

                if (!cName) { window.markInvalid('cardNameInput'); return window.showToast("Please enter Card Name", "error"); }
                if (!/^\d{16}$/.test(cNum)) { window.markInvalid('cardNumInput'); return window.showToast("Card Number must be 16 digits", "error"); }
                if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(cExp)) { window.markInvalid('cardExpiryInput'); return window.showToast("Expiry Date must be MM/YY", "error"); }
                if (!/^\d{3,4}$/.test(cCVV)) { window.markInvalid('cardCVVInput'); return window.showToast("CVV must be 3 or 4 digits", "error"); }
            }

            const order = await store.placeOrder(store.data.currentOrderType, method, store.data.selectedTableId, store.data.selectedCustomerId);
            if (order) {
                payModal.style.display = 'none';
                document.getElementById('receiptDate').textContent = new Date().toLocaleString();
                document.getElementById('receiptOrderId').textContent = order.id;
                document.getElementById('receiptPayment').textContent = method;
                document.getElementById('receiptOrderType').textContent = store.data.currentOrderType;
                
                let targetText = 'N/A';
                if (store.data.currentOrderType === 'Dine In' && store.data.selectedTableId) {
                    targetText = 'Table ' + store.data.selectedTableId;
                } else if (store.data.selectedCustomerId) {
                    targetText = 'Cust ' + store.data.selectedCustomerId;
                }
                document.getElementById('receiptTarget').textContent = targetText;

                document.getElementById('receiptItems').innerHTML = order.items.map(i => `<div style="display:flex; justify-content:space-between; margin-bottom:5px;"><span>${i.qty}x ${i.dish.name}</span> <span>${currency}${(i.dish.price * i.qty).toFixed(2)}</span></div>`).join('');
                
                const subtotal = order.items.reduce((sum, i) => sum + (i.dish.price * i.qty), 0);
                const tax = subtotal * 0.1;
                document.getElementById('receiptSubtotal').textContent = currency + subtotal.toFixed(2);
                document.getElementById('receiptTax').textContent = currency + tax.toFixed(2);
                document.getElementById('receiptTotal').textContent = currency + order.total.toFixed(2);
                document.getElementById('receiptModal').style.display = 'flex';
            }
        };

        // Receipt Modal
        document.getElementById('closeReceiptBtn').onclick = () => {
            document.getElementById('receiptModal').style.display = 'none';
            store.data.selectedTableId = null;
            store.data.selectedCustomerId = null;
            container.querySelector('#selectTableBtn').innerHTML = `<i class="fa-solid fa-chair"></i> Table`;
            container.querySelector('#selectCustBtn').innerHTML = `<i class="fa-solid fa-user"></i> Customer`;
            updateCartView();
        };
        document.getElementById('sendToKitchenBtn').onclick = () => {
            window.showConfirm("Kitchen", "Send order to kitchen?", async () => {
                const orderId = document.getElementById('receiptOrderId').textContent;
                await store.fetchAPI('/audit', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'NOTIFICATION', entity_type: 'ORDER', entity_id: orderId, details: 'Sent order to kitchen' })
                });
                window.showToast("Sent to Kitchen successfully!", "success");
            });
        };
        document.getElementById('shareMobileBtn').onclick = () => {
            window.showConfirm("Mobile", "Send receipt to mobile?", async () => {
                const orderId = document.getElementById('receiptOrderId').textContent;
                await store.fetchAPI('/audit', {
                    method: 'POST',
                    body: JSON.stringify({ action: 'NOTIFICATION', entity_type: 'ORDER', entity_id: orderId, details: 'Sent receipt to mobile' })
                });
                window.showToast("Sent to Mobile successfully!", "success");
            });
        };
        document.getElementById('printReceiptBtn').onclick = () => window.print();

        // 4. Initial Render Calls
        console.log('Order Line Module Initializing...');
        renderCategories();
        renderGrid();
        updateCartView();
    }

    async function renderTables(container) {
        if (!document.getElementById('tables-css')) {
            const link = document.createElement('link');
            link.id = 'tables-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/tables.css';
            document.head.appendChild(link);
        }

        container.innerHTML = `<div style="padding:40px;">Loading tables...</div>`;

        try {
            const res = await store.fetchAPI('/tables');
            const tables = await res.json();

            container.innerHTML = `
                <div class="tables-layout">
                    <div class="tables-header" style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h2>Manage Tables</h2>
                            <div class="tables-legend" style="margin-top:8px;">
                                <div class="legend-item"><div class="legend-color legend-available"></div> Available</div>
                                <div class="legend-item"><div class="legend-color legend-occupied"></div> Occupied</div>
                                <div class="legend-item"><div class="legend-color legend-reserved"></div> Reserved</div>
                                <div class="legend-item"><div class="legend-color legend-dirty"></div> Dirty</div>
                            </div>
                        </div>
                        ${['admin', 'manager'].includes(store.data.currentUser.role) ? '<button class="btn btn-primary" id="addTableBtn"><i class="fa-solid fa-plus"></i> Add New Table</button>' : ''}
                    </div>

                    <div class="floor-plan" style="position:relative; min-height:500px; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--border-radius-lg); margin-top:20px; display:flex; flex-wrap:wrap; gap:20px; padding:20px;">
                        ${tables.map(t => `
                            <div class="table-obj status-${t.status.toLowerCase()}" style="position:relative; width:120px; height:120px; border-radius:12px; display:flex; flex-direction:column; justify-content:center; align-items:center; cursor:pointer;" data-id="${t.id}" data-name="${t.name}" data-seats="${t.seats}" data-status="${t.status}">
                                <span class="table-name" style="font-weight:bold; font-size:18px;">${t.name}</span>
                                <span class="table-seats" style="font-size:12px;">${t.seats} Seats</span>
                                ${t.status === 'Dirty' ? `
                                    <button class="clean-table-btn" data-id="${t.id}" style="margin-top:8px; background:var(--primary); border:none; color:black; padding:4px 8px; border-radius:6px; font-size:10px; font-weight:bold; cursor:pointer;">
                                        <i class="fa-solid fa-broom"></i> Ready
                                    </button>
                                ` : ''}
                                <div style="position:absolute; bottom:8px; display:flex; gap:4px;">
                                    ${['admin', 'manager'].includes(store.data.currentUser.role) ? `
                                        <button class="edit-table-btn" data-id="${t.id}" style="background:none; border:none; color:inherit; cursor:pointer; font-size:12px;"><i class="fa-solid fa-pen"></i></button>
                                        <button class="delete-table-btn" data-id="${t.id}" style="background:none; border:none; color:inherit; cursor:pointer; font-size:12px;"><i class="fa-solid fa-trash"></i></button>
                                    ` : ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>

                <!-- Table Modal -->
                <div id="tableModal" class="modal-overlay" style="display:none;">
                    <div class="modal-content">
                        <h3 id="tableModalTitle">Add New Table</h3>
                        <form id="tableForm">
                            <input type="hidden" id="tableId">
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Table Name (e.g. T1)</label>
                                <input type="text" id="tableName" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Number of Seats</label>
                                <input type="number" id="tableSeats" min="1" required>
                            </div>
                            <div class="form-group" id="statusGroup" style="margin-bottom: 12px; display:none;">
                                <label>Status</label>
                                <select id="tableStatus" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
                                    <option value="Available">Available</option>
                                    <option value="Occupied">Occupied</option>
                                    <option value="Reserved">Reserved</option>
                                    <option value="Dirty">Dirty</option>
                                </select>
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="btn btn-outline" id="closeTableModal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Table</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            const modal = document.getElementById('tableModal');
            const form = document.getElementById('tableForm');

            document.getElementById('addTableBtn').addEventListener('click', () => {
                form.reset();
                document.getElementById('tableId').value = '';
                document.getElementById('tableModalTitle').textContent = 'Add New Table';
                document.getElementById('statusGroup').style.display = 'none';
                modal.style.display = 'flex';
            });

            container.querySelectorAll('.edit-table-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const parent = e.currentTarget.closest('.table-obj');
                    document.getElementById('tableId').value = parent.getAttribute('data-id');
                    document.getElementById('tableName').value = parent.getAttribute('data-name');
                    document.getElementById('tableSeats').value = parent.getAttribute('data-seats');
                    document.getElementById('tableStatus').value = parent.getAttribute('data-status');
                    document.getElementById('tableModalTitle').textContent = 'Edit Table';
                    document.getElementById('statusGroup').style.display = 'block';
                    modal.style.display = 'flex';
                });
            });

            // Clean Table Button
            container.querySelectorAll('.clean-table-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.getAttribute('data-id');
                    try {
                        const res = await store.fetchAPI(`/tables/${id}/status`, {
                            method: 'PATCH',
                            body: JSON.stringify({ status: 'Available' })
                        });
                        if (res.ok) {
                            window.showToast("Table is now ready!");
                            await store.init();
                            renderTables(container);
                        }
                    } catch (err) {
                        window.showToast("Failed to update table", "error");
                    }
                });
            });

            container.querySelectorAll('.delete-table-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const id = e.currentTarget.getAttribute('data-id');
                    window.showConfirm("Delete Table", "Are you sure you want to delete this table?", async () => {
                        await store.fetchAPI(`/tables/${id}`, { method: 'DELETE' });
                        window.showToast("Table deleted successfully");
                        await store.init();
                        renderTables(container);
                    });
                });
            });

            document.getElementById('closeTableModal').addEventListener('click', () => modal.style.display = 'none');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                window.clearValidations('#tableForm');
                const id = document.getElementById('tableId').value;
                const nameEl = document.getElementById('tableName');
                const seatsEl = document.getElementById('tableSeats');
                const name = nameEl.value.trim();
                const seats = parseInt(seatsEl.value);
                const status = document.getElementById('tableStatus').value || 'Available';

                let hasError = false;
                if (!name) {
                    window.markInvalid('tableName');
                    window.showToast("Table Name is required.", "error");
                    hasError = true;
                }
                if (isNaN(seats) || seats <= 0) {
                    window.markInvalid('tableSeats');
                    window.showToast("Seats must be a positive number.", "error");
                    hasError = true;
                }

                if (hasError) return;

                const payload = { name, seats, status };

                try {
                    const res = await store.fetchAPI(id ? `/tables/${id}` : `/tables`, {
                        method: id ? 'PUT' : 'POST',
                        body: JSON.stringify(payload)
                    });
                    
                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error);
                    }
                    
                    window.showToast(id ? "Table updated successfully" : "Table added successfully");
                    modal.style.display = 'none';
                    await store.init();
                    renderTables(container);
                } catch (err) {
                    window.showToast(err.message, "error");
                }
            });

        } catch (err) {
            container.innerHTML = `<div style="padding:40px; color:red;">Failed to load tables.</div>`;
        }
    }

    function renderDishes(container) {
        if (!document.getElementById('dishes-css')) {
            const link = document.createElement('link');
            link.id = 'dishes-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/dishes.css';
            document.head.appendChild(link);
        }

        const categories = store.getCategories();
        let currentCat = 'all';
        const currency = store.data.settings.currency_symbol || 'Rs.';

        const drawView = () => {
            const dishes = store.getDishes(currentCat);
            container.innerHTML = `
                <div class="dishes-layout">
                    <!-- Sidebar -->
                    <div class="category-sidebar">
                        <div class="sidebar-header" style="padding:20px; border-bottom:1px solid var(--border-color);">
                            <h3>Categories</h3>
                        </div>
                        <ul class="category-list" style="list-style:none; padding:10px;">
                            <li class="category-item ${currentCat === 'all' ? 'active' : ''}" data-id="all" style="padding:10px; cursor:pointer;">All Dishes</li>
                            ${categories.map(c => `
                                <li class="category-item ${currentCat === c.id ? 'active' : ''}" data-id="${c.id}" style="padding:10px; cursor:pointer;">
                                    ${c.name} (${c.count || 0})
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <!-- Main Content -->
                    <div class="dishes-main" style="flex:1; padding:24px;">
                        <div class="dishes-header" style="display:flex; justify-content:space-between; margin-bottom:24px;">
                            <div>
                                <h2>Manage Dishes</h2>
                                <p style="color:var(--text-muted); font-size:14px; margin-top:4px;">Add, edit, or remove menu items.</p>
                            </div>
                            ${['admin', 'manager'].includes(store.data.currentUser.role) ? '<button class="btn btn-primary" id="addDishBtn"><i class="fa-solid fa-plus"></i> Add New Dish</button>' : ''}
                        </div>
                        
                        <div class="dishes-grid" style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:20px;">
                            ${dishes.map(d => `
                                <div class="dish-card" style="background:var(--bg-card); border-radius:var(--border-radius-md); overflow:hidden; border:1px solid var(--border-color);">
                                    <img src="${d.image}" alt="${d.name}" style="width:100%; height:140px; object-fit:cover;">
                                    <div class="dish-details" style="padding:16px;">
                                        <div class="dish-name" style="font-weight:600; margin-bottom:4px;">${d.name}</div>
                                        <div class="dish-price" style="color:var(--primary); font-weight:700;">${currency}${d.price.toFixed(2)}</div>
                                        ${['admin', 'manager'].includes(store.data.currentUser.role) ? `
                                            <div style="margin-top:12px; display:flex; gap:8px;">
                                                <button class="btn btn-outline edit-dish-btn" data-id="${d.id}" data-name="${d.name}" data-price="${d.price}" data-cat="${d.category_id}" data-img="${d.image}" style="flex:1; padding:6px; font-size:12px;">Edit</button>
                                                <button class="btn btn-outline delete-dish-btn" data-id="${d.id}" style="padding:6px; font-size:12px; border-color:#ef4444; color:#ef4444;"><i class="fa-solid fa-trash"></i></button>
                                            </div>
                                        ` : ''}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Dish Modal -->
                <div id="dishModal" class="modal-overlay" style="display:none;">
                    <div class="modal-content">
                        <h3 id="dishModalTitle">Add New Dish</h3>
                        <form id="dishForm">
                            <input type="hidden" id="dishId">
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Dish Name</label>
                                <input type="text" id="dishName" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Category</label>
                                <select id="dishCategory" required style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
                                    ${categories.filter(c => c.id !== 'all').map(c => `<option value="${c.id}">${c.name}</option>`).join('')}
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Price (${currency})</label>
                                <input type="number" step="0.01" id="dishPrice" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Image URL</label>
                                <input type="url" id="dishImage" placeholder="https://images.unsplash.com/..." required>
                            </div>
                            <div id="dishPreviewContainer" style="text-align: center; margin-bottom: 16px;">
                                <img id="dishImgPreview" src="" style="width: 100px; height: 100px; border-radius: 20px; object-fit: cover; display: none; border: 2px solid var(--primary-light);">
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="btn btn-outline" id="closeDishModal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Dish</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            // Category Clicks
            container.querySelectorAll('.category-item').forEach(item => {
                item.addEventListener('click', (e) => {
                    currentCat = e.currentTarget.getAttribute('data-id');
                    drawView();
                });
            });

            // Modal Logic
            const modal = document.getElementById('dishModal');
            const form = document.getElementById('dishForm');

            // Image Preview Logic
            const imgInput = document.getElementById('dishImage');
            const imgPreview = document.getElementById('dishImgPreview');
            imgInput.addEventListener('input', (e) => {
                if (e.target.value) {
                    imgPreview.src = e.target.value;
                    imgPreview.style.display = 'inline-block';
                } else {
                    imgPreview.style.display = 'none';
                }
            });

            document.getElementById('addDishBtn').addEventListener('click', () => {
                form.reset();
                imgPreview.style.display = 'none';
                document.getElementById('dishId').value = '';
                document.getElementById('dishModalTitle').textContent = 'Add New Dish';
                modal.style.display = 'flex';
            });

            container.querySelectorAll('.edit-dish-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    document.getElementById('dishId').value = e.target.getAttribute('data-id');
                    document.getElementById('dishName').value = e.target.getAttribute('data-name');
                    document.getElementById('dishPrice').value = e.target.getAttribute('data-price');
                    document.getElementById('dishCategory').value = e.target.getAttribute('data-cat');
                    document.getElementById('dishImage').value = e.target.getAttribute('data-img');
                    document.getElementById('dishModalTitle').textContent = 'Edit Dish';
                    modal.style.display = 'flex';
                });
            });

            container.querySelectorAll('.delete-dish-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    window.showConfirm("Delete Dish", "Are you sure you want to delete this dish?", async () => {
                        await store.fetchAPI(`/dishes/${id}`, { method: 'DELETE' });
                        window.showToast("Dish deleted successfully");
                        await store.init();
                        drawView();
                    }, 'danger');
                });
            });

            document.getElementById('closeDishModal').addEventListener('click', () => modal.style.display = 'none');

            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                window.clearValidations('#dishForm');
                const id = document.getElementById('dishId').value;
                const nameEl = document.getElementById('dishName');
                const priceEl = document.getElementById('dishPrice');
                const imageEl = document.getElementById('dishImage');
                
                const name = nameEl.value.trim();
                const price = parseFloat(priceEl.value);
                const image = imageEl.value.trim();
                const category_id = document.getElementById('dishCategory').value;

                let hasError = false;
                if (!name) {
                    window.markInvalid('dishName');
                    window.showToast("Dish Name is required.", "error");
                    hasError = true;
                }
                if (isNaN(price) || price <= 0) {
                    window.markInvalid('dishPrice');
                    window.showToast("Price must be greater than zero.", "error");
                    hasError = true;
                }
                if (!image) {
                    window.markInvalid('dishImage');
                    window.showToast("Image URL is required.", "error");
                    hasError = true;
                }

                if (hasError) return;

                const payload = { name, category_id, price, image };

                try {
                    const method = id ? 'PUT' : 'POST';
                    const res = await store.fetchAPI(id ? `/dishes/${id}` : `/dishes`, {
                        method: method,
                        body: JSON.stringify(payload)
                    });

                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error);
                    }

                    window.showToast(id ? "Dish updated successfully" : "Dish added successfully");
                    modal.style.display = 'none';
                    await store.init(); // Reload data
                    drawView();
                } catch (err) {
                    window.showToast(err.message, "error");
                }
            });
        };

        drawView();
    }

    async function renderCustomers(container) {
        if (!document.getElementById('customers-css')) {
            const link = document.createElement('link');
            link.id = 'customers-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/customers.css';
            document.head.appendChild(link);
        }

        container.innerHTML = `<div style="padding: 40px;">Loading customers...</div>`;

        try {
            const res = await store.fetchAPI('/customers');
            const customers = await res.json();

            container.innerHTML = `
                <div class="customers-layout">
                    <div class="customers-header">
                        <h2>Customer Management</h2>
                        <button class="btn btn-primary" id="addCustomerBtn"><i class="fa-solid fa-plus"></i> Add New Customer</button>
                    </div>
                    
                    <div class="customers-panel">
                        <table class="customers-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Phone</th>
                                    <th>Email</th>
                                    <th>Loyalty Points</th>
                                    <th>Total Spent</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${customers.map(c => `
                                    <tr>
                                        <td>#CUST-${c.id}</td>
                                        <td><strong>${c.name}</strong></td>
                                        <td>${c.phone}</td>
                                        <td>${c.email || 'N/A'}</td>
                                        <td><span class="loyalty-badge">${c.loyalty_points} pts</span></td>
                                        <td><span class="spent-badge">$${c.total_spent.toFixed(2)}</span></td>
                                        <td>
                                            <button class="btn btn-outline edit-cust-btn" data-id="${c.id}" data-name="${c.name}" data-phone="${c.phone}" data-email="${c.email || ''}" data-points="${c.loyalty_points}" data-spent="${c.total_spent}" style="padding: 6px 12px; font-size: 12px; margin-right: 8px;">Edit</button>
                                            <button class="btn btn-outline delete-cust-btn" data-id="${c.id}" style="padding: 6px 12px; font-size: 12px; border-color: #ef4444; color: #ef4444;">Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                                ${customers.length === 0 ? '<tr><td colspan="7" style="text-align:center; padding: 40px;">No customers found.</td></tr>' : ''}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- Customer Modal -->
                <div id="custModal" class="modal-overlay" style="display:none;">
                    <div class="modal-content">
                        <h3 id="custModalTitle">Add New Customer</h3>
                        <form id="custForm">
                            <input type="hidden" id="custId">
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Full Name</label>
                                <input type="text" id="custName" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Phone Number</label>
                                <input type="text" id="custPhone" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Email Address</label>
                                <input type="email" id="custEmail">
                            </div>
                            <div id="editFields" style="display:none;">
                                <div style="display:flex; gap:12px; margin-bottom:12px;">
                                    <div class="form-group" style="flex:1;">
                                        <label>Loyalty Points</label>
                                        <input type="number" id="custPoints">
                                    </div>
                                    <div class="form-group" style="flex:1;">
                                        <label>Total Spent ($)</label>
                                        <input type="number" step="0.01" id="custSpent">
                                    </div>
                                </div>
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="btn btn-outline" id="closeCustModal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Customer</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            const modal = document.getElementById('custModal');
            const form = document.getElementById('custForm');
            const editFields = document.getElementById('editFields');

            // Add Customer
            document.getElementById('addCustomerBtn').addEventListener('click', () => {
                form.reset();
                document.getElementById('custId').value = '';
                editFields.style.display = 'none';
                document.getElementById('custModalTitle').textContent = 'Add New Customer';
                modal.style.display = 'flex';
            });

            // Edit Customer
            container.querySelectorAll('.edit-cust-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.getAttribute('data-id');
                    const name = e.target.getAttribute('data-name');
                    const phone = e.target.getAttribute('data-phone');
                    const email = e.target.getAttribute('data-email');
                    const points = e.target.getAttribute('data-points');
                    const spent = e.target.getAttribute('data-spent');
                    
                    document.getElementById('custId').value = id;
                    document.getElementById('custName').value = name;
                    document.getElementById('custPhone').value = phone;
                    document.getElementById('custEmail').value = email;
                    document.getElementById('custPoints').value = points;
                    document.getElementById('custSpent').value = spent;
                    
                    editFields.style.display = 'block';
                    document.getElementById('custModalTitle').textContent = 'Edit Customer';
                    modal.style.display = 'flex';
                });
            });

            // Delete Customer
            container.querySelectorAll('.delete-cust-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.getAttribute('data-id');
                    const name = e.target.getAttribute('data-name');
                    window.showConfirm("Delete Customer", `Are you sure you want to delete ${name}? This action cannot be undone.`, async () => {
                        await store.fetchAPI(`/customers/${id}`, { method: 'DELETE' });
                        window.showToast("Customer deleted successfully");
                        await store.init();
                        renderCustomers(container); 
                    }, 'danger');
                });
            });

            // Close Modal
            document.getElementById('closeCustModal').addEventListener('click', () => modal.style.display = 'none');

            // Submit Form
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                window.clearValidations('#custForm');
                const id = document.getElementById('custId').value;
                const name = document.getElementById('custName').value.trim();
                const phone = document.getElementById('custPhone').value.trim();
                const email = document.getElementById('custEmail').value.trim();
                
                let hasError = false;
                if (!name) {
                    window.markInvalid('custName');
                    window.showToast("Name is required.", "error");
                    hasError = true;
                }
                if (!phone) {
                    window.markInvalid('custPhone');
                    window.showToast("Phone is required.", "error");
                    hasError = true;
                }

                if (hasError) return;

                const payload = { name, phone, email };
                if (id) {
                    payload.loyalty_points = parseInt(document.getElementById('custPoints').value) || 0;
                    payload.total_spent = parseFloat(document.getElementById('custSpent').value) || 0;
                }

                try {
                    const method = id ? 'PUT' : 'POST';
                    const res = await store.fetchAPI(id ? `/customers/${id}` : `/customers`, {
                        method: method,
                        body: JSON.stringify(payload)
                    });
                    
                    if (!res.ok) {
                        const err = await res.json();
                        throw new Error(err.error);
                    }
                    
                    window.showToast(id ? "Customer updated successfully" : "Customer added successfully");
                    modal.style.display = 'none';
                    await store.init();
                    renderCustomers(container);
                } catch (err) {
                    window.showToast(err.message, "error");
                }
            });

        } catch (e) {
            container.innerHTML = `<div style="padding: 40px; color: red;">Failed to load customers.</div>`;
        }
    }

    async function renderUsers(container) {
        if (!document.getElementById('users-css')) {
            const link = document.createElement('link');
            link.id = 'users-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/users.css';
            document.head.appendChild(link);
        }

        container.innerHTML = `<div style="padding: 40px;">Loading users...</div>`;

        try {
            const res = await store.fetchAPI('/users');
            const users = await res.json();

            container.innerHTML = `
                <div class="users-layout">
                    <div class="users-header">
                        <h2>Staff & Users Management</h2>
                        <button class="btn btn-primary" id="addUserBtn"><i class="fa-solid fa-plus"></i> Add New User</button>
                    </div>
                    
                    <div class="users-panel">
                        <table class="users-table">
                            <thead>
                                <tr>
                                    <th>ID</th>
                                    <th>Name</th>
                                    <th>Username</th>
                                    <th>Role</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${users.map(u => `
                                    <tr>
                                        <td>${u.id}</td>
                                        <td><strong>${u.name}</strong></td>
                                        <td>${u.username}</td>
                                        <td><span class="type-badge">${u.role.toUpperCase()}</span></td>
                                        <td>
                                            <button class="btn btn-outline edit-user-btn" data-id="${u.id}" data-name="${u.name}" data-role="${u.role}" style="padding: 6px 12px; font-size: 12px; margin-right: 8px;">Edit</button>
                                            <button class="btn btn-outline delete-user-btn" data-id="${u.id}" style="padding: 6px 12px; font-size: 12px; border-color: #ef4444; color: #ef4444;">Delete</button>
                                        </td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>

                <!-- User Modal -->
                <div id="userModal" class="modal-overlay" style="display:none;">
                    <div class="modal-content">
                        <h3 id="userModalTitle">Add New User</h3>
                        <form id="userForm">
                            <input type="hidden" id="userId">
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Full Name</label>
                                <input type="text" id="userName" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Username</label>
                                <input type="text" id="userUsername" required>
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Password (Leave blank to keep current if editing)</label>
                                <input type="password" id="userPassword">
                            </div>
                            <div class="form-group" style="margin-bottom: 12px;">
                                <label>Role</label>
                                <select id="userRole" style="width: 100%; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--border-radius-sm);">
                                    <option value="admin">Admin</option>
                                    <option value="manager">Manager</option>
                                    <option value="cashier">Cashier</option>
                                    <option value="waiter">Waiter</option>
                                    <option value="kitchen">Kitchen</option>
                                </select>
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="btn btn-outline" id="closeUserModal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save User</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            const modal = document.getElementById('userModal');
            const form = document.getElementById('userForm');

            // Add User
            document.getElementById('addUserBtn').addEventListener('click', () => {
                form.reset();
                document.getElementById('userId').value = '';
                document.getElementById('userUsername').disabled = false;
                document.getElementById('userPassword').required = true;
                document.getElementById('userModalTitle').textContent = 'Add New User';
                modal.style.display = 'flex';
            });

            // Edit User
            container.querySelectorAll('.edit-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.getAttribute('data-id');
                    const name = e.target.getAttribute('data-name');
                    const role = e.target.getAttribute('data-role');
                    
                    document.getElementById('userId').value = id;
                    document.getElementById('userName').value = name;
                    document.getElementById('userUsername').value = 'Cannot edit username';
                    document.getElementById('userUsername').disabled = true;
                    document.getElementById('userRole').value = role;
                    document.getElementById('userPassword').required = false;
                    
                    document.getElementById('userModalTitle').textContent = 'Edit User';
                    modal.style.display = 'flex';
                });
            });

            // Delete User
            container.querySelectorAll('.delete-user-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = e.target.getAttribute('data-id');
                    const name = e.target.getAttribute('data-name');
                    window.showConfirm("Delete User", `Are you sure you want to delete ${name}?`, async () => {
                        await store.fetchAPI(`/users/${id}`, { method: 'DELETE' });
                        window.showToast("User deleted successfully");
                        await store.init();
                        renderUsers(container);
                    }, 'danger');
                });
            });

            // Close Modal
            document.getElementById('closeUserModal').addEventListener('click', () => modal.style.display = 'none');

            // Submit Form
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                window.clearValidations('#userForm');
                const id = document.getElementById('userId').value;
                const nameEl = document.getElementById('userName');
                const usernameEl = document.getElementById('userUsername');
                const passwordEl = document.getElementById('userPassword');
                
                const name = nameEl.value.trim();
                const username = usernameEl.value.trim();
                const password = passwordEl.value;
                const role = document.getElementById('userRole').value;

                let hasError = false;
                if (!name) {
                    window.markInvalid('userName');
                    window.showToast("Name is required.", "error");
                    hasError = true;
                }
                if (!id && username.length < 3) {
                    window.markInvalid('userUsername');
                    window.showToast("Username must be at least 3 characters.", "error");
                    hasError = true;
                }
                if (!id && password.length < 4) {
                    window.markInvalid('userPassword');
                    window.showToast("Password must be at least 4 characters.", "error");
                    hasError = true;
                }
                if (id && password && password.length < 4) {
                    window.markInvalid('userPassword');
                    window.showToast("New password must be at least 4 characters.", "error");
                    hasError = true;
                }

                if (hasError) return;

                const payload = { name, role, password };

                try {
                    const url = id ? `http://localhost:3000/api/users/${id}` : `http://localhost:3000/api/users`;
                    const method = id ? 'PUT' : 'POST';
                    if (!id) payload.username = username;

                    const res = await store.fetchAPI(id ? `/users/${id}` : `/users`, {
                        method: method,
                        body: JSON.stringify(payload)
                    });
                    
                    if (!res.ok) {
                        let errMsg = "Server error";
                        try {
                            const err = await res.json();
                            errMsg = err.error || errMsg;
                        } catch(e) {
                            errMsg = await res.text() || errMsg;
                        }
                        throw new Error(errMsg);
                    }
                    
                    window.showToast(id ? "User updated successfully" : "User added successfully");
                    modal.style.display = 'none';
                    await store.init();
                    renderUsers(container);
                } catch (err) {
                    console.error("User submission error:", err);
                    window.showToast(err.message, "error");
                }
            });

        } catch (e) {
            container.innerHTML = `<div style="padding: 40px; color: red;">Failed to load users. Is the server running?</div>`;
        }
    }

    let kitchenTimerInterval = null;

    function renderKitchen(container) {
        if (!document.getElementById('kitchen-css')) {
            const link = document.createElement('link');
            link.id = 'kitchen-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/kitchen.css';
            document.head.appendChild(link);
        }

        if (kitchenTimerInterval) clearInterval(kitchenTimerInterval);

        const pendingOrders = store.data.orders
            .filter(o => o.status === 'Preparing' || o.status === 'Ready')
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        
        // Calculate Prep Summary
        const prepMap = {};
        pendingOrders.forEach(ord => {
            if (ord.status === 'Preparing') {
                ord.items.forEach(item => {
                    prepMap[item.dish.name] = (prepMap[item.dish.name] || 0) + item.qty;
                });
            }
        });

        container.innerHTML = `
            <div class="kitchen-layout">
                <div class="kitchen-main">
                    <div class="kitchen-header">
                        <h2>Kitchen Display System (KDS)</h2>
                        <div style="font-weight: 600; color: #10b981; display:flex; align-items:center; gap:8px;">
                            <span class="status-pulse" style="width:10px; height:10px; background:#10b981; border-radius:50%;"></span> 
                            Live Sync Active
                        </div>
                    </div>
                    
                    <div class="tickets-container">
                        ${pendingOrders.length === 0 ? '<div style="background:rgba(255,255,255,0.5); padding:40px; border-radius:24px; text-align:center; width:100%;">No active orders in kitchen.</div>' : ''}
                        
                        ${pendingOrders.map(ord => {
                            const table = store.data.tables.find(t => t.id == ord.table_id);
                            return `
                                <div class="ticket-card" data-id="${ord.id}" data-date="${ord.date}">
                                    <div class="ticket-header urgency-normal" id="header-${ord.id}">
                                        <span class="ticket-id">${ord.id}</span>
                                        <span class="ticket-timer" id="timer-${ord.id}">00:00</span>
                                    </div>
                                    <div class="ticket-context">
                                        <i class="fa-solid ${ord.order_type === 'Takeaway' ? 'fa-bag-shopping' : 'fa-chair'}"></i>
                                        <span>${ord.order_type || 'Dine In'}</span>
                                        ${table ? `<span style="background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:4px; font-size:11px;">${table.name}</span>` : ''}
                                    </div>
                                    <div class="ticket-items">
                                        ${ord.items.map(item => `
                                            <div class="ticket-item">
                                                <div class="t-item-qty">${item.qty}x</div>
                                                <div style="font-weight:600;">${item.dish.name}</div>
                                            </div>
                                        `).join('')}
                                    </div>
                                    <div class="ticket-actions">
                                        ${ord.status === 'Preparing' 
                                            ? `<button class="btn btn-primary btn-kitchen mark-ready-btn" data-id="${ord.id}">Mark as Ready</button>` 
                                            : `<button class="btn btn-outline btn-kitchen mark-completed-btn" data-id="${ord.id}" style="border-color:#10b981; color:#10b981;">Serve (Completed)</button>`
                                        }
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>

                <div class="prep-sidebar">
                    <h3><i class="fa-solid fa-fire-burner" style="color:var(--primary);"></i> Batch Prep Summary</h3>
                    <ul class="prep-list">
                        ${Object.entries(prepMap).length > 0 ? Object.entries(prepMap).map(([name, qty]) => `
                            <li class="prep-item">
                                <span>${name}</span>
                                <span class="prep-qty">${qty}</span>
                            </li>
                        `).join('') : '<p style="color:var(--text-muted); font-size:14px;">Nothing to prep yet.</p>'}
                    </ul>
                    <div style="margin-top:auto; padding-top:20px; font-size:12px; color:var(--text-muted); border-top:1px solid var(--border-color);">
                        Total items to cook: ${Object.values(prepMap).reduce((a, b) => a + b, 0)}
                    </div>
                </div>
            </div>
        `;

        // Update Timers Logic
        const updateTimers = () => {
            const now = new Date();
            container.querySelectorAll('.ticket-card').forEach(card => {
                const orderId = card.getAttribute('data-id');
                const orderDate = new Date(card.getAttribute('data-date'));
                const diffMs = now - orderDate;
                const diffMins = Math.floor(diffMs / 60000);
                const diffSecs = Math.floor((diffMs % 60000) / 1000);
                
                const timerEl = document.getElementById(`timer-${orderId}`);
                const headerEl = document.getElementById(`header-${orderId}`);
                
                if (timerEl) {
                    timerEl.textContent = `${diffMins.toString().padStart(2, '0')}:${diffSecs.toString().padStart(2, '0')}`;
                }

                // Urgency Color Logic
                if (headerEl) {
                    headerEl.classList.remove('urgency-normal', 'urgency-warning', 'urgency-urgent');
                    if (diffMins >= 20) {
                        headerEl.classList.add('urgency-urgent');
                    } else if (diffMins >= 10) {
                        headerEl.classList.add('urgency-warning');
                    } else {
                        headerEl.classList.add('urgency-normal');
                    }
                }
            });
        };

        updateTimers();
        kitchenTimerInterval = setInterval(updateTimers, 1000);

        // Bind Buttons
        container.querySelectorAll('.mark-ready-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                await store.fetchAPI(`/orders/${id}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({status: 'Ready'})
                });
                // Note: The socket 'order_updated' listener will trigger re-render
            });
        });

        container.querySelectorAll('.mark-completed-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.target.getAttribute('data-id');
                await store.fetchAPI(`/orders/${id}/status`, {
                    method: 'PATCH',
                    body: JSON.stringify({status: 'Completed'})
                });
            });
        });
    }


    function renderHistory(container) {
        if (!document.getElementById('history-css')) {
            const link = document.createElement('link');
            link.id = 'history-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/order-history.css';
            document.head.appendChild(link);
        }

        const orders = store.data.orders;
        const currency = store.data.settings.currency_symbol || 'Rs.';

        container.innerHTML = `
            <div class="history-layout">
                <div class="history-header">
                    <h2>Order History</h2>
                    <button class="btn btn-outline" id="exportCsvBtn"><i class="fa-solid fa-file-export"></i> Export CSV</button>
                </div>
                
                <div class="history-panel">
                    <div class="history-table-wrapper">
                        <table class="history-table">
                            <thead>
                                    <tr>
                                        <th>Order ID</th>
                                        <th>Date & Time</th>
                                        <th>Order Type</th>
                                        <th>Payment Method</th>
                                        <th>Items</th>
                                        <th>Total Amount</th>
                                        <th>Status</th>
                                        ${store.data.currentUser.role === 'admin' ? '<th>Actions</th>' : ''}
                                    </tr>
                                </thead>
                                <tbody>
                                    ${orders.length > 0 ? orders.map(ord => `
                                        <tr>
                                            <td><strong>${ord.id}</strong></td>
                                            <td>${new Date(ord.date).toLocaleDateString()} <br> <span style="color:var(--text-muted); font-size:12px;">${new Date(ord.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></td>
                                            <td><span class="type-badge">${ord.order_type || 'Dine In'}</span></td>
                                            <td><span class="method-badge">${ord.payment_method || 'Cash'}</span></td>
                                            <td>
                                                ${ord.items.length} items
                                                <div class="history-items-list">
                                                    ${ord.items.map(i => `${i.qty}x ${i.dish.name}`).join(', ')}
                                                </div>
                                            </td>
                                            <td><strong>${currency}${ord.total.toFixed(2)}</strong></td>
                                            <td><span class="status-badge status-${ord.status.toLowerCase()}">${ord.status}</span></td>
                                            ${store.data.currentUser.role === 'admin' ? `
                                                <td>
                                                    ${ord.status !== 'Cancelled' ? `
                                                        <button class="btn btn-outline cancel-order-btn" data-id="${ord.id}" style="padding:6px 12px; font-size:11px; border-color:#ef4444; color:#ef4444;">
                                                            <i class="fa-solid fa-ban"></i> Cancel/Refund
                                                        </button>
                                                    ` : '<span style="color:var(--text-muted); font-size:11px;">Already Cancelled</span>'}
                                                </td>
                                            ` : ''}
                                        </tr>
                                    `).join('') : '<tr><td colspan="8" style="text-align:center;">No orders found.</td></tr>'}
                                </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            const headers = ['Order ID', 'Date', 'Type', 'Payment', 'Total', 'Status'];
            const rows = orders.map(o => [
                o.id,
                new Date(o.date).toLocaleString().replace(',', ''),
                o.order_type,
                o.payment_method || 'Cash',
                o.total.toFixed(2),
                o.status
            ]);

            let csvContent = "data:text/csv;charset=utf-8," 
                + headers.join(",") + "\n"
                + rows.map(e => e.join(",")).join("\n");

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `orders_history_${new Date().toISOString().slice(0,10)}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // Cancel Button Listeners
        container.querySelectorAll('.cancel-order-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const order = store.data.orders.find(o => o.id === id);
                const customer = order && order.customer_id ? store.data.customers.find(c => c.id == order.customer_id) : null;
                const customerInfo = customer ? `<br><span style="font-weight:700; color:#ef4444;">Customer: ${customer.name} (${customer.phone})</span>` : "";
                
                window.showConfirm("Cancel Order", `Are you sure you want to CANCEL and REFUND order ${id}?${customerInfo}<br><br>This will restore stock and refund loyalty points.`, async (reason) => {
                    try {
                        const res = await store.fetchAPI(`/orders/${id}/cancel`, { 
                            method: 'POST',
                            body: JSON.stringify({ reason })
                        });
                        if (res.ok) {
                            window.showToast("Order cancelled successfully.");
                            await store.refreshData();
                            renderHistory(container);
                        } else {
                            const err = await res.json();
                            window.showToast(err.error || "Failed to cancel order", "error");
                        }
                    } catch (err) {
                        window.showToast("Failed to connect to server.", "error");
                    }
                }, 'danger', true, "Enter cancellation reason (e.g. Customer changed mind)");
            });
        });
    }

    function renderHelp(container) {
        container.innerHTML = `
            <div style="padding:40px; max-width:800px; margin:0 auto;">
                <h2 style="margin-bottom:8px;">Help Center</h2>
                <p style="color:var(--text-muted); margin-bottom:32px;">Quick guide to using the POS system.</p>
                <div style="display:grid; gap:16px;">
                    ${[
                        {icon:'fa-cash-register', title:'Order Line', body:'Select Dine-In or Takeaway, choose a table/customer, add items to cart, and click Pay Now to complete the order.'},
                        {icon:'fa-chair', title:'Tables', body:'View and manage all restaurant tables. Click a table to see its details and update its status.'},
                        {icon:'fa-utensils', title:'Dishes', body:'Add, edit, or delete menu items. Use categories to keep the menu organized.'},
                        {icon:'fa-users', title:'Customers', body:'Manage customer profiles. Search by name or phone number to quickly find returning guests.'},
                        {icon:'fa-fire-burner', title:'Kitchen', body:'Monitor live kitchen tickets. Mark orders as Ready when preparation is complete.'},
                        {icon:'fa-gear', title:'Settings', body:'Configure business information, tax rates, currency, and receipt details from the Settings page.'}
                    ].map(item => `
                        <div style="display:flex; gap:16px; padding:20px; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:14px; backdrop-filter:blur(20px);">
                            <div style="width:44px; height:44px; border-radius:10px; background:var(--primary-light); color:var(--primary); display:flex; align-items:center; justify-content:center; font-size:20px; flex-shrink:0;">
                                <i class="fa-solid ${item.icon}"></i>
                            </div>
                            <div>
                                <div style="font-weight:700; margin-bottom:4px;">${item.title}</div>
                                <div style="font-size:14px; color:var(--text-muted); line-height:1.6;">${item.body}</div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    async function renderSettings(container) {
        container.innerHTML = `<div style="padding:40px; display:flex; align-items:center; gap:12px; color:var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading Settings...</div>`;

        let settings = {};
        let inventory = [];
        let auditLogs = [];
        try {
            const [setRes, invRes, auditRes] = await Promise.all([
                store.fetchAPI('/settings'),
                store.fetchAPI('/inventory'),
                store.fetchAPI('/audit-logs')
            ]);
            settings = await setRes.json();
            inventory = await invRes.json();
            auditLogs = await auditRes.json();
        } catch(e) {
            container.innerHTML = `<div style="padding:40px; color:#ef4444;">Failed to load settings data.</div>`;
            return;
        }

        let activeTab = 'business';

        const tabs = [
            { id: 'business', icon: 'fa-building', label: 'Business Info' },
            { id: 'order', icon: 'fa-receipt', label: 'Orders & Tax' },
            { id: 'inventory', icon: 'fa-box-open', label: 'Inventory' },
            { id: 'receipt', icon: 'fa-file-invoice', label: 'Receipt' },
            { id: 'audit', icon: 'fa-clipboard-list', label: 'Audit Logs' },
            { id: 'security', icon: 'fa-shield-halved', label: 'Security' },
        ];

        const inputStyle = `width:100%; padding:12px 16px; border-radius:10px; border:1px solid var(--border-color); background:rgba(255,255,255,0.05); color:var(--text-main); font-size:14px; outline:none; transition:border-color 0.2s;`;

        const tabContent = {
            business: `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                    <div class="settings-group">
                        <label class="settings-label">Business Name</label>
                        <input id="s_business_name" class="settings-input" type="text" value="${settings.business_name || ''}" style="${inputStyle}">
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">Phone Number</label>
                        <input id="s_business_phone" class="settings-input" type="text" value="${settings.business_phone || ''}" style="${inputStyle}">
                    </div>
                    <div class="settings-group" style="grid-column:1/-1;">
                        <label class="settings-label">Address</label>
                        <input id="s_business_address" class="settings-input" type="text" value="${settings.business_address || ''}" style="${inputStyle}">
                    </div>
                    <div class="settings-group" style="grid-column:1/-1;">
                        <label class="settings-label">Email Address</label>
                        <input id="s_business_email" class="settings-input" type="email" value="${settings.business_email || ''}" style="${inputStyle}">
                    </div>
                </div>`,
            order: `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
                    <div class="settings-group">
                        <label class="settings-label">Tax Rate (%)</label>
                        <input id="s_tax_rate" class="settings-input" type="number" min="0" max="100" value="${settings.tax_rate || '10'}" style="${inputStyle}">
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">Currency Symbol</label>
                        <input id="s_currency_symbol" class="settings-input" type="text" maxlength="4" value="${settings.currency_symbol || 'Rs.'}" style="${inputStyle}">
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">Order ID Prefix</label>
                        <input id="s_order_prefix" class="settings-input" type="text" maxlength="5" value="${settings.order_prefix || 'ORD'}" style="${inputStyle}">
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">Low Stock Alert Threshold</label>
                        <input id="s_low_stock_threshold" class="settings-input" type="number" min="1" value="${settings.low_stock_threshold || '10'}" style="${inputStyle}">
                    </div>
                    <div class="settings-group" style="grid-column:1/-1; display:flex; align-items:center; justify-content:space-between; padding:16px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:10px;">
                        <div>
                            <div style="font-weight:600; margin-bottom:4px;">Allow Discounts</div>
                            <div style="font-size:13px; color:var(--text-muted);">Enable cashiers to apply manual discounts at checkout</div>
                        </div>
                        <label style="position:relative; display:inline-block; width:52px; height:28px; flex-shrink:0;">
                            <input type="checkbox" id="s_allow_discounts" style="opacity:0; width:0; height:0;" ${settings.allow_discounts === 'true' ? 'checked' : ''}>
                            <span id="toggle_allow_discounts" style="position:absolute; cursor:pointer; inset:0; border-radius:34px; background:${settings.allow_discounts === 'true' ? 'var(--primary)' : '#374151'}; transition:0.3s;">
                                <span style="position:absolute; height:20px; width:20px; left:${settings.allow_discounts === 'true' ? '26px' : '4px'}; bottom:4px; border-radius:50%; background:white; transition:0.3s;"></span>
                            </span>
                        </label>
                    </div>
                </div>`,
            receipt: `
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:24px; align-items:start;">
                    <!-- LEFT: Edit Fields -->
                    <div style="display:grid; gap:16px;">
                        <div style="font-weight:700; font-size:13px; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:4px;"><i class="fa-solid fa-pen-to-square"></i> Format Options</div>

                        <div class="settings-group">
                            <label class="settings-label">Header Title</label>
                            <input id="rf_header" type="text" value="${settings.business_name || 'TASTY OF ASCENDIA'}" style="${inputStyle}">
                        </div>

                        <div class="settings-group">
                            <label class="settings-label">Tagline / Sub-header</label>
                            <input id="rf_tagline" type="text" value="${settings.receipt_tagline || settings.business_address || '123 Culinary Ave'}" placeholder="e.g. Fine Dining and Takeout" style="${inputStyle}">
                        </div>

                        <div class="settings-group">
                            <label class="settings-label">Footer Message</label>
                            <textarea id="rf_footer" class="settings-input" rows="2" style="${inputStyle} resize:none;">${settings.receipt_footer || 'Thank you for dining with us!'}</textarea>
                        </div>

                        <div class="settings-group">
                            <label class="settings-label">Separator Style</label>
                            <select id="rf_separator" style="${inputStyle} cursor:pointer;">
                                <option value="dashed" ${(settings.receipt_separator||'dashed')==='dashed' ? 'selected' : ''}>- - - Dashed - - -</option>
                                <option value="solid" ${(settings.receipt_separator||'')==='solid' ? 'selected' : ''}>Solid Line</option>
                                <option value="dotted" ${(settings.receipt_separator||'')==='dotted' ? 'selected' : ''}>... Dotted ...</option>
                            </select>
                        </div>

                        <div style="font-weight:700; font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px; padding-top:8px; border-top:1px solid var(--border-color);">Show / Hide Sections</div>

                        <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; cursor:pointer;">
                            <span style="font-size:13px; font-weight:500;">Show Date & Time</span>
                            <input type="checkbox" id="rf_show_date" ${settings.receipt_show_date !== 'false' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--primary); cursor:pointer;">
                        </label>
                        <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; cursor:pointer;">
                            <span style="font-size:13px; font-weight:500;">Show Order ID</span>
                            <input type="checkbox" id="rf_show_orderid" ${settings.receipt_show_orderid !== 'false' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--primary); cursor:pointer;">
                        </label>
                        <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; cursor:pointer;">
                            <span style="font-size:13px; font-weight:500;">Show Order Type</span>
                            <input type="checkbox" id="rf_show_type" ${settings.receipt_show_type !== 'false' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--primary); cursor:pointer;">
                        </label>
                        <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; cursor:pointer;">
                            <span style="font-size:13px; font-weight:500;">Show Tax Breakdown</span>
                            <input type="checkbox" id="rf_show_tax" ${settings.receipt_show_tax !== 'false' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--primary); cursor:pointer;">
                        </label>
                        <label style="display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,0.03); border:1px solid var(--border-color); border-radius:8px; cursor:pointer;">
                            <span style="font-size:13px; font-weight:500;">Show Business Phone</span>
                            <input type="checkbox" id="rf_show_phone" ${settings.receipt_show_phone !== 'false' ? 'checked' : ''} style="width:16px; height:16px; accent-color:var(--primary); cursor:pointer;">
                        </label>
                    </div>

                    <!-- RIGHT: Live Preview -->
                    <div style="position:sticky; top:0;">
                        <div style="font-weight:700; font-size:13px; color:var(--primary); text-transform:uppercase; letter-spacing:0.5px; margin-bottom:12px;"><i class="fa-solid fa-eye"></i> Live Preview</div>
                        <div id="receiptLivePreview" style="background:white; color:#111; font-family:monospace; font-size:12px; line-height:1.9; padding:20px 24px; border-radius:12px; box-shadow:0 0 40px rgba(0,0,0,0.4);"></div>
                    </div>
                </div>`,
            inventory: `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <h3 style="margin:0; font-size:18px;">Raw Materials</h3>
                            <p style="color:var(--text-muted); font-size:13px;">Manage stock levels and low-stock alerts.</p>
                        </div>
                        <button class="btn btn-primary" id="addInvBtn"><i class="fa-solid fa-plus"></i> Add Material</button>
                    </div>
                    <div style="max-height:400px; overflow-y:auto; border:1px solid var(--border-color); border-radius:12px;">
                        <table class="orders-table" style="width:100%; border-collapse:collapse;">
                            <thead>
                                <tr style="background:rgba(255,255,255,0.02); text-align:left;">
                                    <th style="padding:12px; font-size:12px; color:var(--text-muted);">Name</th>
                                    <th style="padding:12px; font-size:12px; color:var(--text-muted);">Stock</th>
                                    <th style="padding:12px; font-size:12px; color:var(--text-muted);">Status</th>
                                    <th style="padding:12px; font-size:12px; color:var(--text-muted);">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${inventory.length > 0 ? inventory.map(item => `
                                    <tr style="border-top:1px solid var(--border-color);">
                                        <td style="padding:12px;"><strong>${item.name}</strong></td>
                                        <td style="padding:12px;">${item.stock_qty} ${item.unit}</td>
                                        <td style="padding:12px;">
                                            ${item.stock_qty <= item.low_stock_threshold 
                                                ? '<span class="status-badge" style="background:rgba(239,68,68,0.1); color:#fca5a5; border:1px solid rgba(239,68,68,0.2);">Low Stock</span>' 
                                                : '<span class="status-badge" style="background:rgba(16,185,129,0.1); color:#34d399; border:1px solid rgba(16,185,129,0.2);">Healthy</span>'}
                                        </td>
                                        <td style="padding:12px; display:flex; gap:8px;">
                                            <button class="btn btn-outline edit-inv-btn" data-id="${item.id}" data-name="${item.name}" data-qty="${item.stock_qty}" data-unit="${item.unit}" data-thresh="${item.low_stock_threshold}" data-exp="${item.expiry_date || ''}" style="padding:4px 8px; font-size:11px;">Edit</button>
                                            <button class="btn btn-outline delete-inv-btn" data-id="${item.id}" style="padding:4px 8px; font-size:11px; border-color:rgba(239,68,68,0.4); color:#fca5a5;">Delete</button>
                                        </td>
                                    </tr>
                                `).join('') : '<tr><td colspan="4" style="padding:24px; text-align:center; color:var(--text-muted);">No materials found</td></tr>'}
                            </tbody>
                        </table>
                    </div>
                </div>`,
            audit: `
                <div style="display:flex; flex-direction:column; gap:20px;">
                    <div>
                        <h3 style="margin:0; font-size:18px;">System Audit Logs</h3>
                        <p style="color:var(--text-muted); font-size:13px;">Review recent administrative and transactional actions.</p>
                    </div>
                    <div style="max-height:500px; overflow-y:auto; border:1px solid var(--border-color); border-radius:12px; background:rgba(0,0,0,0.2);">
                        <div style="padding:0 16px;">
                            ${auditLogs.length > 0 ? auditLogs.map(log => `
                                <div style="padding:16px 0; border-bottom:1px solid var(--border-color); display:flex; gap:16px;">
                                    <div style="width:40px; height:40px; border-radius:10px; background:rgba(255,255,255,0.05); display:flex; align-items:center; justify-content:center; flex-shrink:0; font-size:16px; color:var(--primary);">
                                        <i class="fa-solid ${log.action.includes('CREATE') ? 'fa-plus-circle' : log.action.includes('DELETE') ? 'fa-trash' : 'fa-pen-to-square'}"></i>
                                    </div>
                                    <div style="flex:1;">
                                        <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                                            <span style="font-weight:600; font-size:14px;">${log.action.replace(/_/g, ' ')}</span>
                                            <span style="font-size:11px; color:var(--text-muted);">${new Date(log.timestamp).toLocaleString()}</span>
                                        </div>
                                        <div style="font-size:13px; color:var(--text-muted); line-height:1.5;">${log.details}</div>
                                        <div style="margin-top:6px; font-size:11px;">
                                            <span style="color:var(--primary); font-weight:700;">${log.target_type} ID:</span> ${log.target_id}
                                        </div>
                                    </div>
                                </div>
                            `).join('') : '<div style="padding:40px; text-align:center; color:var(--text-muted);">No audit logs found</div>'}
                        </div>
                    </div>
                </div>`,
            security: `
                <div style="display:grid; gap:20px; max-width:480px;">
                    <div style="padding:16px; background:rgba(0,242,254,0.05); border:1px solid rgba(0,242,254,0.2); border-radius:12px; font-size:13px; color:var(--text-muted); display:flex; gap:12px; align-items:flex-start;">
                        <i class="fa-solid fa-circle-info" style="color:var(--primary); margin-top:2px;"></i>
                        <span>Changing your password will log you out of all other active sessions. You will need to log in again with the new password.</span>
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">Current Password</label>
                        <input id="s_current_pass" type="password" placeholder="Enter current password" style="${inputStyle}">
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">New Password</label>
                        <input id="s_new_pass" type="password" placeholder="Minimum 6 characters" style="${inputStyle}">
                    </div>
                    <div class="settings-group">
                        <label class="settings-label">Confirm New Password</label>
                        <input id="s_confirm_pass" type="password" placeholder="Repeat new password" style="${inputStyle}">
                    </div>
                    <button id="changePasswordBtn" class="btn btn-primary" style="width:fit-content;">
                        <i class="fa-solid fa-key"></i> Change Password
                    </button>
                </div>`
        };

        const render = () => {
            container.innerHTML = `
                <div style="padding:32px; height:100%; display:flex; flex-direction:column; gap:24px; overflow-y:auto;">
                    <div>
                        <h2 style="font-size:24px; font-weight:700; margin-bottom:4px;">Settings</h2>
                        <p style="color:var(--text-muted); font-size:14px;">Manage your restaurant's configuration and preferences.</p>
                    </div>

                    <div style="display:flex; gap:8px; background:rgba(255,255,255,0.04); padding:6px; border-radius:14px; border:1px solid var(--glass-border); width:fit-content;">
                        ${tabs.map(t => `
                            <button data-tab="${t.id}" class="settings-tab-btn" style="padding:10px 20px; border-radius:10px; border:none; cursor:pointer; font-weight:600; font-size:13px; display:flex; align-items:center; gap:8px; transition:all 0.25s;
                                background:${activeTab === t.id ? 'var(--primary)' : 'transparent'};
                                color:${activeTab === t.id ? '#000' : 'var(--text-muted)'};
                                box-shadow:${activeTab === t.id ? 'var(--shadow-glow)' : 'none'};">
                                <i class="fa-solid ${t.icon}"></i> ${t.label}
                            </button>
                        `).join('')}
                    </div>

                    <div style="background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:20px; padding:32px; backdrop-filter:blur(20px); flex:1; max-width:800px;">
                        <style>
                            .settings-label { display:block; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:var(--text-muted); margin-bottom:8px; }
                            .settings-input:focus { border-color:var(--primary) !important; box-shadow:0 0 0 3px var(--primary-light); }
                        </style>
                        ${tabContent[activeTab]}

                        ${['business', 'order', 'receipt'].includes(activeTab) ? `
                        <div style="margin-top:32px; padding-top:24px; border-top:1px solid var(--border-color); display:flex; gap:12px; justify-content:flex-end;">
                            <button id="cancelSettingsBtn" class="btn btn-outline">Cancel</button>
                            <button id="saveSettingsBtn" class="btn btn-primary"><i class="fa-solid fa-floppy-disk"></i> Save Changes</button>
                        </div>` : ''}
                    </div>
                </div>

                <!-- Inventory Modal -->
                <div id="invModal" class="modal-overlay" style="display:none;">
                    <div class="modal-content" style="max-width:450px;">
                        <h3 id="invModalTitle">Add New Material</h3>
                        <form id="invForm">
                            <input type="hidden" id="invId">
                            <div class="form-group" style="margin-bottom:16px;">
                                <label class="settings-label">Material Name</label>
                                <input type="text" id="invName" class="settings-input" style="${inputStyle}" required>
                            </div>
                            <div style="display:flex; gap:16px; margin-bottom:16px;">
                                <div class="form-group" style="flex:1;">
                                    <label class="settings-label">Stock Qty</label>
                                    <input type="number" id="invQty" step="0.1" class="settings-input" style="${inputStyle}" required>
                                </div>
                                <div class="form-group" style="flex:1;">
                                    <label class="settings-label">Unit (e.g. kg, pcs)</label>
                                    <input type="text" id="invUnit" class="settings-input" style="${inputStyle}" required>
                                </div>
                            </div>
                            <div class="form-group" style="margin-bottom:16px;">
                                <label class="settings-label">Low Stock Threshold</label>
                                <input type="number" id="invThresh" step="0.1" class="settings-input" style="${inputStyle}" required>
                            </div>
                            <div class="form-group" style="margin-bottom:24px;">
                                <label class="settings-label">Expiry Date</label>
                                <input type="date" id="invExp" class="settings-input" style="${inputStyle}">
                            </div>
                            <div class="modal-actions">
                                <button type="button" class="btn btn-outline" id="closeInvModal">Cancel</button>
                                <button type="submit" class="btn btn-primary">Save Material</button>
                            </div>
                        </form>
                    </div>
                </div>
            `;

            // Tab switching
            container.querySelectorAll('.settings-tab-btn').forEach(btn => {
                btn.onclick = () => {
                    activeTab = btn.getAttribute('data-tab');
                    render();
                };
            });

            // Live Preview for Receipt tab
            if (activeTab === 'receipt') {
                const buildPreview = () => {
                    const header   = document.getElementById('rf_header')?.value || settings.business_name || 'TASTY OF ASCENDIA';
                    const tagline  = document.getElementById('rf_tagline')?.value || '';
                    const footer   = document.getElementById('rf_footer')?.value || '';
                    const sep      = document.getElementById('rf_separator')?.value || 'dashed';
                    const showDate    = document.getElementById('rf_show_date')?.checked !== false;
                    const showOrderId = document.getElementById('rf_show_orderid')?.checked !== false;
                    const showType    = document.getElementById('rf_show_type')?.checked !== false;
                    const showTax     = document.getElementById('rf_show_tax')?.checked !== false;
                    const showPhone   = document.getElementById('rf_show_phone')?.checked !== false;
                    const cur      = settings.currency_symbol || 'Rs.';
                    const tax      = settings.tax_rate || '10';
                    const prefix   = settings.order_prefix || 'ORD';
                    const phone    = settings.business_phone || '';
                    const sepStyle = `border-top:1px ${sep} #555; margin:8px 0; padding-top:8px;`;

                    const preview = document.getElementById('receiptLivePreview');
                    if (!preview) return;
                    preview.innerHTML = `
                        <div style="text-align:center; font-weight:bold; font-size:16px; margin-bottom:2px;">${header}</div>
                        ${tagline ? `<div style="text-align:center; font-size:11px; color:#555; margin-bottom:8px;">${tagline}</div>` : ''}
                        ${showPhone && phone ? `<div style="text-align:center; font-size:11px; color:#555; margin-bottom:8px;">${phone}</div>` : ''}
                        <div style="${sepStyle}">
                            ${showDate ? `<div>Date: ${new Date().toLocaleString()}</div>` : ''}
                            ${showOrderId ? `<div>Order ID: ${prefix}-XXXX</div>` : ''}
                            ${showType ? `<div>Type: Dine In | Table 3</div>` : ''}
                        </div>
                        <div style="${sepStyle}">
                            <div style="display:flex; justify-content:space-between; margin-bottom:4px;"><span>1x Grilled Chicken</span><span>${cur}12.00</span></div>
                            <div style="display:flex; justify-content:space-between;"><span>2x Spring Rolls</span><span>${cur}8.00</span></div>
                        </div>
                        <div style="${sepStyle}">
                            ${showTax ? `<div style="display:flex; justify-content:space-between;"><span>Subtotal:</span><span>${cur}20.00</span></div>` : ''}
                            ${showTax ? `<div style="display:flex; justify-content:space-between;"><span>Tax (${tax}%):</span><span>${cur}2.00</span></div>` : ''}
                            <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:13px;"><span>TOTAL:</span><span>${cur}22.00</span></div>
                        </div>
                        ${footer ? `<div style="text-align:center; margin-top:14px; font-size:11px; color:#555; border-top:1px ${sep} #ccc; padding-top:10px;">${footer}</div>` : ''}
                    `;
                };

                // Attach listeners to all receipt format inputs for live updates
                setTimeout(() => {
                    buildPreview();
                    ['rf_header','rf_tagline','rf_footer','rf_separator','rf_show_date','rf_show_orderid','rf_show_type','rf_show_tax','rf_show_phone'].forEach(id => {
                        document.getElementById(id)?.addEventListener('input', buildPreview);
                        document.getElementById(id)?.addEventListener('change', buildPreview);
                    });
                }, 0);
            }
            const toggleEl = document.getElementById('toggle_allow_discounts');
            const checkboxEl = document.getElementById('s_allow_discounts');
            if (toggleEl && checkboxEl) {
                toggleEl.onclick = () => {
                    checkboxEl.checked = !checkboxEl.checked;
                    const checked = checkboxEl.checked;
                    toggleEl.style.background = checked ? 'var(--primary)' : '#374151';
                    toggleEl.querySelector('span').style.left = checked ? '26px' : '4px';
                };
            }

            // Save Settings
            const saveBtn = document.getElementById('saveSettingsBtn');
            if (saveBtn) {
                saveBtn.onclick = async () => {
                    const updates = {};
                    if (activeTab === 'business') {
                        updates.business_name = document.getElementById('s_business_name').value.trim();
                        updates.business_phone = document.getElementById('s_business_phone').value.trim();
                        updates.business_address = document.getElementById('s_business_address').value.trim();
                        updates.business_email = document.getElementById('s_business_email').value.trim();
                        if (!updates.business_name) return window.showToast('Business name is required', 'error');
                    } else if (activeTab === 'order') {
                        updates.tax_rate = document.getElementById('s_tax_rate').value;
                        updates.currency_symbol = document.getElementById('s_currency_symbol').value.trim();
                        updates.order_prefix = document.getElementById('s_order_prefix').value.trim().toUpperCase();
                        updates.low_stock_threshold = document.getElementById('s_low_stock_threshold').value;
                        updates.allow_discounts = String(document.getElementById('s_allow_discounts').checked);
                        if (!updates.currency_symbol) return window.showToast('Currency symbol is required', 'error');
                        if (isNaN(updates.tax_rate) || updates.tax_rate < 0 || updates.tax_rate > 100) return window.showToast('Tax rate must be 0–100', 'error');
                    } else if (activeTab === 'receipt') {
                        updates.receipt_footer       = document.getElementById('rf_footer').value.trim();
                        updates.receipt_tagline      = document.getElementById('rf_tagline').value.trim();
                        updates.business_name        = document.getElementById('rf_header').value.trim();
                        updates.receipt_separator    = document.getElementById('rf_separator').value;
                        updates.receipt_show_date    = String(document.getElementById('rf_show_date').checked);
                        updates.receipt_show_orderid = String(document.getElementById('rf_show_orderid').checked);
                        updates.receipt_show_type    = String(document.getElementById('rf_show_type').checked);
                        updates.receipt_show_tax     = String(document.getElementById('rf_show_tax').checked);
                        updates.receipt_show_phone   = String(document.getElementById('rf_show_phone').checked);
                        if (!updates.business_name) return window.showToast('Header title is required', 'error');
                    }

                    saveBtn.disabled = true;
                    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
                    try {
                        const res = await store.fetchAPI('/settings', { method: 'PUT', body: JSON.stringify(updates) });
                        if (res.ok) {
                            Object.assign(settings, updates);
                            Object.assign(store.data.settings, updates);
                            syncBrand();
                            window.showToast('Settings saved successfully!', 'success');
                        } else {
                            const err = await res.json();
                            window.showToast(err.error || 'Failed to save', 'error');
                        }
                    } catch(e) {
                        window.showToast('Could not connect to server', 'error');
                    }
                    saveBtn.disabled = false;
                    saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save Changes';
                };
            }

            // Change Password
            const changePwBtn = document.getElementById('changePasswordBtn');
            if (changePwBtn) {
                changePwBtn.onclick = async () => {
                    const current = document.getElementById('s_current_pass').value;
                    const newPw = document.getElementById('s_new_pass').value;
                    const confirm = document.getElementById('s_confirm_pass').value;

                    if (!current) return window.showToast('Enter your current password', 'error');
                    if (newPw.length < 6) return window.showToast('New password must be at least 6 characters', 'error');
                    if (newPw !== confirm) return window.showToast('Passwords do not match', 'error');

                    changePwBtn.disabled = true;
                    changePwBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
                    try {
                        const user = store.data.currentUser;
                        const res = await store.fetchAPI(`/users/${user.id}`, {
                            method: 'PUT',
                            body: JSON.stringify({ name: user.name, role: user.role, password: newPw })
                        });
                        if (res.ok) {
                            window.showToast('Password changed! Please log in again.', 'success');
                            setTimeout(() => {
                                store.data.currentUser = null;
                                window.location.hash = '#/login';
                            }, 1500);
                        } else {
                            const err = await res.json();
                            window.showToast(err.error || 'Failed to change password', 'error');
                        }
                    } catch(e) {
                        window.showToast('Could not connect to server', 'error');
                    }
                    changePwBtn.disabled = false;
                    changePwBtn.innerHTML = '<i class="fa-solid fa-key"></i> Change Password';
                };
            }

            // Inventory Logic
            if (activeTab === 'inventory') {
                const invModal = document.getElementById('invModal');
                const invForm = document.getElementById('invForm');

                document.getElementById('addInvBtn').onclick = () => {
                    invForm.reset();
                    document.getElementById('invId').value = '';
                    document.getElementById('invModalTitle').textContent = 'Add New Material';
                    invModal.style.display = 'flex';
                };

                document.getElementById('closeInvModal').onclick = () => invModal.style.display = 'none';

                container.querySelectorAll('.edit-inv-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        const target = e.currentTarget;
                        document.getElementById('invId').value = target.getAttribute('data-id');
                        document.getElementById('invName').value = target.getAttribute('data-name');
                        document.getElementById('invQty').value = target.getAttribute('data-qty');
                        document.getElementById('invUnit').value = target.getAttribute('data-unit');
                        document.getElementById('invThresh').value = target.getAttribute('data-thresh');
                        document.getElementById('invExp').value = target.getAttribute('data-exp');
                        document.getElementById('invModalTitle').textContent = 'Edit Material';
                        invModal.style.display = 'flex';
                    };
                });

                container.querySelectorAll('.delete-inv-btn').forEach(btn => {
                    btn.onclick = (e) => {
                        const id = e.currentTarget.getAttribute('data-id');
                        window.showConfirm("Delete Material", "Are you sure you want to delete this material?", async () => {
                            await store.fetchAPI(`/inventory/${id}`, { method: 'DELETE' });
                            window.showToast("Material deleted successfully");
                            renderSettings(container);
                        }, 'danger');
                    };
                });

                invForm.onsubmit = async (e) => {
                    e.preventDefault();
                    window.clearValidations('#invForm');
                    const id = document.getElementById('invId').value;
                    const name = document.getElementById('invName').value.trim();
                    const qty = parseFloat(document.getElementById('invQty').value);
                    const unit = document.getElementById('invUnit').value.trim();
                    const thresh = parseFloat(document.getElementById('invThresh').value);
                    const exp = document.getElementById('invExp').value;

                    let hasError = false;
                    if (!name) { window.markInvalid('invName'); hasError = true; }
                    if (isNaN(qty) || qty < 0) { window.markInvalid('invQty'); hasError = true; }
                    if (!unit) { window.markInvalid('invUnit'); hasError = true; }
                    if (isNaN(thresh) || thresh < 0) { window.markInvalid('invThresh'); hasError = true; }

                    if (hasError) return window.showToast("Please check all fields", "error");

                    const payload = {
                        name,
                        stock_qty: qty,
                        unit,
                        low_stock_threshold: thresh,
                        expiry_date: exp
                    };

                    try {
                        const method = id ? 'PUT' : 'POST';
                        const url = id ? `/inventory/${id}` : '/inventory';
                        const res = await store.fetchAPI(url, { method, body: JSON.stringify(payload) });
                        if (res.ok) {
                            window.showToast(id ? "Material updated" : "Material added");
                            invModal.style.display = 'none';
                            renderSettings(container);
                        } else {
                            const err = await res.json();
                            window.showToast(err.error || "Failed to save material", "error");
                        }
                    } catch(err) {
                        window.showToast("Network error", "error");
                    }
                };
            }

            document.getElementById('cancelSettingsBtn')?.addEventListener('click', async () => {
                const res = await store.fetchAPI('/settings');
                settings = await res.json();
                render();
            });
        };

        render();
    }

    async function renderServing(container) {
        if (!document.getElementById('kitchen-css')) {
            const link = document.createElement('link');
            link.id = 'kitchen-css';
            link.rel = 'stylesheet';
            link.href = 'assets/css/kitchen.css';
            document.head.appendChild(link);
        }

        const drawView = () => {
            const readyOrders = store.data.orders
                .filter(o => o.status === 'Ready')
                .sort((a, b) => new Date(a.date) - new Date(b.date));

            container.innerHTML = `
                <div style="padding:32px; height:100%; display:flex; flex-direction:column; gap:24px;">
                    <div>
                        <h2 style="font-size:24px; font-weight:700; margin-bottom:4px;">Ready to Serve</h2>
                        <p style="color:var(--text-muted); font-size:14px;">Orders waiting to be delivered to customers.</p>
                    </div>

                    <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(300px, 1fr)); gap:20px; overflow-y:auto; flex:1; align-content:start;">
                        ${readyOrders.length === 0 ? `
                            <div style="grid-column:1/-1; background:var(--glass-bg); border:1px solid var(--glass-border); border-radius:24px; padding:60px; text-align:center; backdrop-filter:blur(20px);">
                                <div style="font-size:48px; color:var(--primary); opacity:0.3; margin-bottom:20px;">
                                    <i class="fa-solid fa-plate-wheat"></i>
                                </div>
                                <h3 style="margin-bottom:8px;">No Orders Ready</h3>
                                <p style="color:var(--text-muted);">When the kitchen marks an order as ready, it will appear here.</p>
                            </div>
                        ` : ''}

                        ${readyOrders.map(ord => {
                            const table = store.data.tables.find(t => t.id == ord.table_id);
                            const customer = ord.customer_id ? store.data.customers.find(c => c.id == ord.customer_id) : null;
                            return `
                                <div class="ticket-card" style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:18px; overflow:hidden; display:flex; flex-direction:column; box-shadow:0 10px 30px rgba(0,0,0,0.1);">
                                    <div style="padding:16px; background:rgba(0, 242, 254, 0.1); border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                                        <span style="font-weight:700; color:var(--primary); font-size:14px;">${ord.id}</span>
                                        <span style="font-size:11px; color:var(--text-muted);">${new Date(ord.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                    </div>
                                    <div style="padding:16px; flex:1;">
                                        <div style="display:flex; align-items:center; gap:8px; margin-bottom:12px;">
                                            <i class="fa-solid ${ord.order_type === 'Takeaway' ? 'fa-bag-shopping' : 'fa-chair'}" style="color:var(--text-muted); font-size:12px;"></i>
                                            <span style="font-weight:600; font-size:13px;">${ord.order_type || 'Dine In'}</span>
                                            ${table ? `<span style="background:var(--primary-light); color:var(--primary); padding:2px 8px; border-radius:4px; font-size:11px;">${table.name}</span>` : ''}
                                        </div>
                                        ${customer ? `<div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;"><i class="fa-solid fa-user" style="margin-right:6px;"></i> ${customer.name}</div>` : ''}
                                        <div style="border-top:1px dashed var(--border-color); padding-top:12px; margin-top:4px;">
                                            ${ord.items.map(item => `
                                                <div style="display:flex; justify-content:space-between; font-size:13px; margin-bottom:6px;">
                                                    <span style="color:var(--text-muted); font-weight:600; min-width:24px;">${item.qty}x</span>
                                                    <span style="flex:1; font-weight:500;">${item.dish.name}</span>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>
                                    <div style="padding:16px; background:rgba(255,255,255,0.02); border-top:1px solid var(--border-color);">
                                        <button class="btn btn-primary mark-served-btn" data-id="${ord.id}" style="width:100%;">
                                            <i class="fa-solid fa-check-double"></i> Mark as Served
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;

            container.querySelectorAll('.mark-served-btn').forEach(btn => {
                btn.onclick = async (e) => {
                    const id = e.currentTarget.getAttribute('data-id');
                    const res = await store.fetchAPI(`/orders/${id}/status`, {
                        method: 'PATCH',
                        body: JSON.stringify({ status: 'Completed' })
                    });
                    if (res.ok) {
                        window.showToast("Order served and completed!");
                        // Re-render via socket if possible, otherwise manual
                        await store.refreshData();
                        drawView();
                    }
                };
            });
        };

        drawView();
        
        // Listen for updates
        const updateListener = () => drawView();
        window.addEventListener('order_updated', updateListener);
        // Clean up on route change would be ideal, but for now we'll just drawView
    }
});
