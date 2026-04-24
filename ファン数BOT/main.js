const GAS_ENDPOINT = ''; 
let currentUser = null;

document.addEventListener('DOMContentLoaded', () => {
    const authOverlay = document.getElementById('authOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const formLogin = document.getElementById('form-login');
    const formRegister = document.getElementById('form-register');
    const authMessage = document.getElementById('auth-message');
    
    document.getElementById('tab-login').onclick = (e) => {
        e.target.classList.add('active');
        document.getElementById('tab-register').classList.remove('active');
        document.getElementById('tab-register').style.color = '#bbb';
        document.getElementById('tab-register').style.borderBottomColor = '#eee';
        e.target.style.color = 'var(--text-dark)';
        e.target.style.borderBottomColor = '#fba1ba';
        formLogin.classList.remove('hidden');
        formRegister.classList.add('hidden');
    };
    document.getElementById('tab-register').onclick = (e) => {
        e.target.classList.add('active');
        document.getElementById('tab-login').classList.remove('active');
        document.getElementById('tab-login').style.color = '#bbb';
        document.getElementById('tab-login').style.borderBottomColor = '#eee';
        e.target.style.color = 'var(--text-dark)';
        e.target.style.borderBottomColor = '#fba1ba';
        formRegister.classList.remove('hidden');
        formLogin.classList.add('hidden');
    };

    const savedUser = localStorage.getItem('uma_current_user');
    if (savedUser) { currentUser = JSON.parse(savedUser); loginSuccess(); }

    formLogin.onsubmit = async (e) => {
        e.preventDefault();
        const res = await callBackend({ action: 'login', name: document.getElementById('login-name').value, password: document.getElementById('login-pass').value });
        if (res.success) { currentUser = res; localStorage.setItem('uma_current_user', JSON.stringify(res)); loginSuccess(); }
        else authMessage.textContent = res.error;
    };

    formRegister.onsubmit = async (e) => {
        e.preventDefault();
        const res = await callBackend({ action: 'register', name: document.getElementById('reg-name').value, password: document.getElementById('reg-pass').value });
        if (res.success) { currentUser = { memberId: res.memberId, name: res.name, icon: '' }; localStorage.setItem('uma_current_user', JSON.stringify(currentUser)); loginSuccess(); }
        else authMessage.textContent = res.error;
    };

    document.getElementById('logoutBtn').onclick = () => {
        localStorage.removeItem('uma_current_user'); currentUser = null;
        appWrapper.style.display = 'none'; authOverlay.classList.remove('hidden');
    };

    function loginSuccess() {
        authOverlay.classList.add('hidden');
        appWrapper.style.display = 'flex';
        const ua = document.getElementById('userAvatar');
        if (currentUser.icon) { ua.style.backgroundImage = `url('${currentUser.icon}')`; ua.textContent = ''; }
        else ua.textContent = currentUser.name.charAt(0);
        refreshDashboard();
    }

    const avUpload = document.getElementById('myAvatarUpload');
    document.getElementById('userAvatar').onclick = () => avUpload.click();
    avUpload.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const rd = new FileReader();
            rd.onload = async (r) => {
                await callBackend({ action: 'update_profile', memberId: currentUser.memberId, icon: r.target.result });
                currentUser.icon = r.target.result;
                localStorage.setItem('uma_current_user', JSON.stringify(currentUser));
                loginSuccess();
            };
            rd.readAsDataURL(file);
        }
    };

    // --- Admin Modal Setup ---
    const adminModal = document.getElementById('admin-modal');
    document.getElementById('adminBtn').onclick = async () => {
        const res = await callBackend({ action: 'get_db' });
        document.getElementById('adminTotalTarget').value = res.db.totalTarget || 100000000;
        const listDiv = document.getElementById('adminMemberList');
        listDiv.innerHTML = '';
        res.db.members.forEach(m => {
            const currTarget = res.db.individualTargets[m.memberId] || 3000000;
            listDiv.innerHTML += `
                <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #eee; padding:5px 0;">
                    <label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
                        <input type="checkbox" class="admin-member-check" value="${m.memberId}">
                        <span>${m.name}</span>
                    </label>
                    <span style="font-size:12px; color:var(--primary);" class="ind-target-display" data-id="${m.memberId}">${currTarget.toLocaleString()}</span>
                </div>
            `;
        });
        adminModal.classList.remove('hidden');
    };
    document.getElementById('closeAdmin').onclick = () => adminModal.classList.add('hidden');

    // Admin: Apply to checked
    document.getElementById('applyIndividualTargetBtn').onclick = () => {
        const val = document.getElementById('adminIndividualTarget').value;
        document.querySelectorAll('.admin-member-check:checked').forEach(chk => {
            const disp = document.querySelector(`.ind-target-display[data-id="${chk.value}"]`);
            if (disp) { disp.textContent = parseInt(val).toLocaleString(); disp.dataset.raw = val; }
        });
    };

    // Admin: Save DB
    document.getElementById('saveAdminBtn').onclick = async () => {
        const payload = {
            action: 'save_admin',
            totalTarget: parseInt(document.getElementById('adminTotalTarget').value),
            individualTargets: {}
        };
        document.querySelectorAll('.ind-target-display').forEach(disp => {
            payload.individualTargets[disp.dataset.id] = parseInt(disp.dataset.raw || disp.textContent.replace(/,/g, ''));
        });
        await callBackend(payload);
        adminModal.classList.add('hidden');
        refreshDashboard();
    };

    // --- Paste & Upload ---
    document.getElementById('dropzone').onclick = () => {
        const finput = document.createElement('input'); finput.type = 'file'; finput.accept = 'image/*';
        finput.onchange = e => { if (e.target.files[0]) handleUpload(e.target.files[0]); };
        finput.click();
    };
    document.addEventListener('paste', e => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.indexOf('image') !== -1);
        if (item) handleUpload(item.getAsFile());
    });

    async function handleUpload(file) {
        document.getElementById('uploadInner').innerHTML = `<p style="font-size:20px; font-weight:bold; color:var(--primary);">解析中...</p>`;
        const reader = new FileReader();
        reader.onload = async () => {
            const res = await callBackend({ action: 'upload', memberId: currentUser.memberId, image: reader.result });
            if (res.success) {
                document.getElementById('uploadInner').innerHTML = `<span class="material-icons-outlined" style="font-size:40px; color:#2ed573;">check_circle</span><p style="color:#2ed573; font-weight:bold;">+${res.detectedFans.toLocaleString()}</p>`;
                setTimeout(() => { document.getElementById('uploadInner').innerHTML = `<span class="material-icons-outlined" style="font-size:40px;">cloud_upload</span><p style="margin-top:10px; font-weight:bold;">Waiting for Paste...</p>`; }, 2000);
                refreshDashboard();
            }
        };
        reader.readAsDataURL(file);
    }

    // --- Dashboard Refresh ---
    async function refreshDashboard() {
        const res = await callBackend({ action: 'get_db' });
        const db = res.db;
        
        let totalCurrent = 0;
        db.members.forEach(m => totalCurrent += (db.fans[m.memberId] || 0));
        
        const totalTarget = db.totalTarget || 100000000;
        const pct = Math.min(100, Math.floor((totalCurrent / totalTarget) * 100));
        const rem = Math.max(0, totalTarget - totalCurrent);

        document.getElementById('totalFanProgress').style.width = pct + '%';
        document.getElementById('totalFanPercentText').textContent = pct + '%';
        document.getElementById('displayTotalTarget').textContent = totalTarget.toLocaleString();
        document.getElementById('displayRemaining').textContent = rem.toLocaleString();

        const mgrid = document.getElementById('membersGrid');
        mgrid.innerHTML = '';
        db.members.forEach(m => {
            const mdiv = document.createElement('div');
            mdiv.className = 'member-avatar-mini';
            if (m.icon) mdiv.style.backgroundImage = `url('${m.icon}')`;
            else mdiv.innerHTML = m.name.charAt(0);
            
            mdiv.onclick = () => {
                document.getElementById('detail-name').textContent = m.name;
                document.getElementById('detail-avatar').innerHTML = m.icon ? '' : m.name.charAt(0);
                document.getElementById('detail-avatar').style.backgroundImage = m.icon ? `url('${m.icon}')` : 'none';
                
                const currF = db.fans[m.memberId] || 0;
                const tarF = db.individualTargets[m.memberId] || 3000000;
                document.getElementById('detail-fan').textContent = `${currF.toLocaleString()} / ${tarF.toLocaleString()}`;
                document.getElementById('detail-progress').style.width = Math.min(100, (currF/tarF)*100) + '%';
                
                document.getElementById('member-drawer-overlay').classList.remove('hidden');
            };
            
            const wrap = document.createElement('div');
            wrap.style.display = 'flex'; wrap.style.flexDirection = 'column'; wrap.style.alignItems = 'center';
            wrap.appendChild(mdiv);
            wrap.innerHTML += `<span class="member-name-mini">${m.name}</span>`;
            mgrid.appendChild(wrap);
        });

        drawChart();
    }

    // --- Chart ---
    let myChart = null;
    function drawChart() {
        const ctx = document.getElementById('growthChart');
        if (!ctx) return;
        if (myChart) myChart.destroy();
        myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Now'], datasets: [{ data: [20, 32, 48, 60, 72, 85], borderColor: '#fba1ba', backgroundColor: 'rgba(251, 161, 186, 0.2)', fill: true, tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { display: true }, y: { display: false } } }
        });
    }

    // --- Drawer Close ---
    document.getElementById('close-drawer-btn').onclick = () => document.getElementById('member-drawer-overlay').classList.add('hidden');

    // --- Backend Mock ---
    async function callBackend(data) {
        if (GAS_ENDPOINT) { const r = await fetch(GAS_ENDPOINT, { method: 'POST', body: JSON.stringify(data) }); return await r.json(); }
        return new Promise(res => {
            setTimeout(() => {
                let db = JSON.parse(localStorage.getItem(DB_KEY) || '{"members":[], "fans":{}, "individualTargets":{}, "totalTarget":100000000}');
                if (data.action === 'register') {
                    if (db.members.find(m => m.name === data.name)) return res({success:false, error:'既に使われています'});
                    const id = 'M' + Date.now();
                    db.members.push({ memberId: id, name: data.name, pass: data.password, icon: '' });
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({ success: true, memberId: id, name: data.name });
                }
                else if (data.action === 'login') {
                    const m = db.members.find(m => m.name === data.name && m.pass === data.password);
                    if (m) res({ success: true, memberId: m.memberId, name: m.name, icon: m.icon });
                    else res({ success: false, error: '違います' });
                }
                else if (data.action === 'update_profile') {
                    db.members.find(m => m.memberId === data.memberId).icon = data.icon;
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true});
                }
                else if (data.action === 'upload') {
                    db.fans[data.memberId] = (db.fans[data.memberId] || 0) + 150000;
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true, detectedFans: 150000});
                }
                else if (data.action === 'get_db') { res({success:true, db: db}); }
                else if (data.action === 'save_admin') {
                    db.totalTarget = data.totalTarget;
                    db.individualTargets = { ...db.individualTargets, ...data.individualTargets };
                    localStorage.setItem(DB_KEY, JSON.stringify(db)); res({success:true});
                }
            }, 100);
        });
    }
});
