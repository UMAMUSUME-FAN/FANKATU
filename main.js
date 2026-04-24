const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = ''; 
let DISCORD_CLIENT_ID = '1497168159210340484'; // 正しいIDに更新しました sw

let currentUser = null;
let currentCircle = null;
let isAdminLogin = false;

// --- DOM References ---
document.addEventListener('DOMContentLoaded', async () => {
    const authOverlay = document.getElementById('authOverlay');
    const appWrapper = document.getElementById('appWrapper');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    
    // --- 1. Boot sequence ---
    try {
        const fragment = new URLSearchParams(window.location.hash.slice(1));
        const accessToken = fragment.get('access_token');

        if (accessToken) {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { authorization: `Bearer ${accessToken}` } });
            const userData = await userRes.json();
            currentUser = { 
                memberId: userData.id, 
                name: userData.username, 
                icon: userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png` : '' 
            };
            localStorage.setItem('uma_current_user', JSON.stringify(currentUser));
            window.location.hash = '';
            await loginSuccess();
        } else {
            const savedUser = localStorage.getItem('uma_current_user');
            if (savedUser) {
                currentUser = JSON.parse(savedUser);
                await loginSuccess();
            } else {
                authOverlay.classList.remove('hidden');
            }
        }
    } catch (e) {
        console.error("Boot failed:", e);
        authOverlay.classList.remove('hidden');
    }

    async function loginSuccess() {
        try {
            const res = await callBackend({ action: 'get_user_circles', memberId: currentUser.memberId });
            authOverlay.classList.add('hidden');
            showCirclePortal(res.circles || []);
        } catch (e) {
            console.error("LoginSuccess error:", e);
            authOverlay.classList.remove('hidden');
        }
    }

    // --- Circle Portal UI ---
    function showCirclePortal(circles) {
        portalOverlay.classList.remove('hidden');
        document.getElementById('portalUserName').textContent = currentUser.name;
        const av = document.getElementById('portalUserAvatar');
        if (currentUser.icon) { av.style.backgroundImage = `url('${currentUser.icon}')`; av.textContent=''; }
        else av.textContent = currentUser.name.charAt(0);

        const list = document.getElementById('myCirclesList');
        list.innerHTML = '';
        if (circles.length === 0) {
            list.innerHTML = '<p style="font-size:11px; color:#bbb; text-align:center;">所属なし</p>';
        }
        circles.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'glass-btn';
            btn.style.width = '100%'; btn.style.textAlign = 'left'; btn.style.fontSize = '13px';
            btn.innerHTML = `<span class="material-icons-outlined" style="font-size:16px; margin-right:8px; vertical-align:middle;">group</span>${c.name}`;
            btn.onclick = () => selectCircle(c.id);
            list.appendChild(btn);
        });
    }

    // Search Circle
    document.getElementById('searchCircleBtn').onclick = async () => {
        const query = document.getElementById('searchCircleInput').value;
        if (!query) return;
        const res = await callBackend({ action: 'search_circles', query: query });
        const list = document.getElementById('searchResultsList');
        list.innerHTML = '';
        res.results.forEach(c => {
            const div = document.createElement('div');
            div.style.display='flex'; div.style.justifyContent='space-between'; div.style.alignItems='center';
            div.style.background='rgba(0,0,0,0.03)'; div.style.padding='8px'; div.style.border='10px';
            div.innerHTML = `<span style="font-size:12px; font-weight:600;">${c.name}</span> <button class="glass-btn primary" style="font-size:10px; padding:3px 8px;">申請</button>`;
            div.querySelector('button').onclick = () => selectCircle(c.id);
            list.appendChild(div);
        });
    };

    // Create Circle
    document.getElementById('showCreateCircleBtn').onclick = () => document.getElementById('create-circle-modal').classList.remove('hidden');
    document.getElementById('cancelCreateCircle').onclick = () => document.getElementById('create-circle-modal').classList.add('hidden');
    document.getElementById('confirmCreateCircle').onclick = async () => {
        const name = document.getElementById('newCircleName').value;
        if (!name) return;
        const res = await callBackend({ action: 'create_circle', name: name, ownerId: currentUser.memberId });
        if (res.success) {
            document.getElementById('create-circle-modal').classList.add('hidden');
            selectCircle(res.circleId);
        }
    };

    async function selectCircle(circleId) {
        const res = await callBackend({ action: 'select_circle', circleId: circleId, memberId: currentUser.memberId });
        if (res.pending) {
            alert('申請を送りました。リーダーの承認をお待ちください。');
            return;
        }
        if (res.success) {
            currentCircle = res.circle;
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            appWrapper.style.flexDirection = 'column';
            appWrapper.style.alignItems = 'center';
            
            const ua = document.getElementById('userAvatar');
            if (currentUser.icon) { ua.style.backgroundImage = `url('${currentUser.icon}')`; ua.textContent = ''; }
            else ua.textContent = currentUser.name.charAt(0);
            
            isAdminLogin = false;
            window.currentChartMode = 'personal';
            refreshDashboard();
        }
    }

    document.getElementById('discordLoginBtn').onclick = () => {
        const redirect = window.location.origin + window.location.pathname;
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=identify`;
        window.location.href = authUrl;
    };

    document.getElementById('logoutBtn').onclick = () => {
        localStorage.removeItem('uma_current_user');
        window.location.reload();
    };

    document.getElementById('switchCircleBtn').onclick = () => {
        currentCircle = null;
        isAdminLogin = false;
        appWrapper.style.display = 'none';
        loginSuccess();
    };

    // --- Admin Functions ---
    document.getElementById('adminBtn').onclick = async () => {
        const res = await callBackend({ action: 'get_db', circleId: currentCircle.id });
        const db = res.db;
        const currentAdminId = db.adminId || 'admin';
        const currentAdminPass = db.adminPass || 'admin';
        
        const enteredId = prompt('管理者IDを入力してください');
        if (enteredId !== currentAdminId) return alert('ID不一致');
        const enteredPass = prompt('管理者パスワード');
        if (enteredPass !== currentAdminPass) return alert('パス不一致');

        isAdminLogin = true;
        refreshDashboard();
        showAdminModal(db);
    };

    function showAdminModal(db) {
        document.getElementById('admin-modal').classList.remove('hidden');
        document.getElementById('adminCircleNameInput').value = currentCircle.name;
        document.getElementById('adminTotalTarget').value = db.totalTarget;
        document.getElementById('adminDiscordInvite').value = db.discordInvite || '';
        document.getElementById('adminDiscordWebhook').value = db.discordWebhook || '';
        document.getElementById('adminIdInput').value = db.adminId || 'admin';
        
        // Requests
        const reqList = document.getElementById('adminJoinRequests');
        reqList.innerHTML = '';
        const requests = db.joinRequests || [];
        requests.forEach(r => {
            const d = document.createElement('div');
            d.style.display='flex'; d.style.justifyContent='space-between'; d.style.marginBottom='5px'; d.style.alignItems='center';
            d.innerHTML = `<span style="font-size:12px;">${r.name}</span> <div><button onclick="window.handleRequest('${r.memberId}',true)" style="background:#2ed573; color:white; border:none; padding:3px 8px; border-radius:5px;">許可</button> <button onclick="window.handleRequest('${r.memberId}',false)" style="background:#ff4757; color:white; border:none; padding:3px 8px; border-radius:5px;">拒否</button></div>`;
            reqList.appendChild(d);
        });

        // Members
        const mList = document.getElementById('adminMemberList');
        mList.innerHTML = '';
        db.members.forEach(m => {
            const label = document.createElement('label');
            label.style.display='block'; label.style.fontSize='12px';
            label.innerHTML = `<input type="checkbox" value="${m.memberId}"> ${m.name} (目標: ${(db.individualTargets[m.memberId]||3000000).toLocaleString()})`;
            mList.appendChild(label);
        });
    }

    window.handleRequest = async (mid, accept) => {
        await callBackend({ action: 'handle_join_request', circleId: currentCircle.id, applicantId: mid, accept: accept });
        document.getElementById('adminBtn').click();
    };

    document.getElementById('saveAdminBtn').onclick = async () => {
        const payload = {
            action: 'save_admin',
            circleId: currentCircle.id,
            name: document.getElementById('adminCircleNameInput').value,
            totalTarget: parseInt(document.getElementById('adminTotalTarget').value),
            discordWebhook: document.getElementById('adminDiscordWebhook').value,
            discordInvite: document.getElementById('adminDiscordInvite').value,
            adminId: document.getElementById('adminIdInput').value,
            adminPass: document.getElementById('adminPassInput').value,
            individualTargets: {}
        };
        await callBackend(payload);
        alert('保存しました');
        document.getElementById('admin-modal').classList.add('hidden');
        refreshDashboard();
    };

    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');

    // --- Dashboard Refresh & Charts ---
    async function refreshDashboard() {
        if (!currentCircle) return;
        const res = await callBackend({ action: 'get_db', circleId: currentCircle.id });
        const db = res.db;
        currentCircle.name = db.name;
        document.querySelectorAll('.circle-name-display').forEach(el => el.textContent = db.name);
        
        const dlink = document.getElementById('circleDiscordLink');
        if (db.discordInvite) { dlink.href = db.discordInvite; dlink.style.display='flex'; } else { dlink.style.display='none'; }

        refreshRanking();

        const myFans = db.fans[currentUser.memberId] || 0;
        const myTarget = db.individualTargets[currentUser.memberId] || 3000000;
        const pct = Math.min(100, Math.floor((myFans/myTarget)*100));
        document.getElementById('totalFanProgress').style.width = pct + '%';
        document.getElementById('totalFanPercentText').textContent = pct + '%';
        document.getElementById('displayTotalTarget').textContent = myTarget.toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, myTarget-myFans).toLocaleString();

        const toggleBtn = document.getElementById('toggleChartBtn');
        if (!window.currentChartMode) window.currentChartMode = 'personal';
        toggleBtn.onclick = () => { 
            window.currentChartMode = window.currentChartMode === 'personal' ? 'circle' : 'personal';
            refreshDashboard();
        };

        if (window.currentChartMode === 'personal') {
            document.getElementById('mainChartTitle').textContent = "My Fan Growth";
            toggleBtn.textContent = "サークル全体を表示";
            drawChart([myFans]); // Simplified for now
        } else {
            document.getElementById('mainChartTitle').textContent = "Circle Growth";
            toggleBtn.textContent = "個人へ戻る";
            drawChart([Object.values(db.fans).reduce((a,b)=>a+b,0)]);
        }

        // Render Members Clickable List
        const mGrid = document.getElementById('membersGrid');
        mGrid.innerHTML = '';
        db.members.forEach(m => {
            const d = document.createElement('div');
            d.className = 'member-item';
            d.style.textAlign='center'; d.style.cursor='pointer';
            d.innerHTML = `<div class="member-avatar" style="background-image:url('${m.icon||''}'); margin:0 auto;">${m.icon?'':m.name.charAt(0)}</div><span style="font-size:10px;">${m.name}</span>`;
            d.onclick = () => showMemberDetail(m, db);
            mGrid.appendChild(d);
        });
    }

    async function refreshRanking() {
        const res = await callBackend({ action: 'get_ranking' });
        const list = document.getElementById('circleRankingList');
        if (!list) return;
        list.innerHTML = '';
        res.ranking.forEach((c, idx) => {
            const isMe = currentCircle && c.id === currentCircle.id;
            const r = document.createElement('div');
            r.style.padding='8px'; r.style.display='flex'; r.style.justifyContent='space-between';
            r.style.background = isMe ? 'rgba(251,161,186,0.1)' : '#fff';
            r.style.borderRadius = '8px'; r.style.cursor='pointer';
            r.onclick = () => { if(!isMe && confirm(c.name+'へ参加申請/切替えますか？')) selectCircle(c.id); };
            r.innerHTML = `<div style="display:flex; gap:10px;"><span style="font-weight:bold;">${idx+1}</span><span>${c.name}</span></div><span style="color:var(--primary); font-weight:bold;">${(c.totalFans/10000).toFixed(1)}万</span>`;
            list.appendChild(r);
        });
    }

    let mainChartInstance = null;
    function drawChart(dataPoints) {
        const ctx = document.getElementById('growthChart').getContext('2d');
        if (mainChartInstance) mainChartInstance.destroy();
        mainChartInstance = new Chart(ctx, {
            type: 'line',
            data: { labels: ['1週','2週','3週','4週','今日'], datasets: [{ data: dataPoints, borderColor: '#fba1ba', tension: 0.4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
        });
    }

    function showMemberDetail(m, db) {
        const overlay = document.getElementById('member-drawer-overlay');
        const drawer = document.getElementById('section-member-details');
        document.getElementById('detail-name').textContent = m.name;
        document.getElementById('detail-fan').textContent = `${(db.fans[m.memberId]||0).toLocaleString()} / ${(db.individualTargets[m.memberId]||3000000).toLocaleString()}`;
        overlay.classList.remove('hidden');
        setTimeout(() => drawer.style.transform = 'translateX(0)', 10);
    }
    document.getElementById('close-drawer-btn').onclick = () => {
        const drawer = document.getElementById('section-member-details');
        drawer.style.transform = 'translateX(-100%)';
        setTimeout(() => document.getElementById('member-drawer-overlay').classList.add('hidden'), 400);
    };

    // --- Clipboard / Upload ---
    window.addEventListener('paste', async (e) => {
        const item = e.clipboardData.items[0];
        if (item && item.type.indexOf('image') !== -1) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = async (ev) => {
                const res = await callBackend({ action: 'upload', circleId: currentCircle.id, memberId: currentUser.memberId });
                alert(`ファン数を +${res.detectedFans.toLocaleString()} 加算しました！`);
                refreshDashboard();
            };
            reader.readAsDataURL(blob);
        }
    });

    // --- Mock Backend ---
    async function callBackend(data) {
        return new Promise(res => {
            setTimeout(() => {
                let db;
                try {
                    const raw = localStorage.getItem(DB_KEY);
                    db = JSON.parse(raw || '{"circles":{}, "userToCircles":{}}');
                    if (raw && !db.circles) { db = {"circles":{}, "userToCircles":{}}; localStorage.setItem(DB_KEY, JSON.stringify(db)); }
                } catch(e) { db = {"circles":{}, "userToCircles":{}}; }
                
                if (data.action === 'get_user_circles') {
                    const ids = db.userToCircles[data.memberId] || [];
                    const list = ids.map(id => ({ id: id, name: db.circles[id] ? db.circles[id].name : 'Unknown' }));
                    res({ success: true, circles: list.filter(x => x.name !== 'Unknown') });
                }
                else if (data.action === 'create_circle') {
                    const id = 'c_' + Math.random().toString(36).substr(2, 9);
                    db.circles[id] = { id:id, name:data.name, ownerId:data.ownerId, members:[{memberId:data.ownerId, name:currentUser.name}], fans:{}, individualTargets:{}, joinRequests:[] };
                    if (!db.userToCircles[data.ownerId]) db.userToCircles[data.ownerId] = [];
                    db.userToCircles[data.ownerId].push(id);
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success:true, circleId:id });
                }
                else if (data.action === 'search_circles') {
                    const list = Object.keys(db.circles).map(k => db.circles[k]).filter(c => c.name.includes(data.query));
                    res({ success:true, results: list });
                }
                else if (data.action === 'select_circle') {
                    const c = db.circles[data.circleId];
                    if (!c) return res({ success:false });
                    const isM = c.members.find(m => m.memberId === data.memberId);
                    if (isM) { res({ success:true, circle: {id:data.circleId, name:c.name} }); }
                    else {
                        c.joinRequests = c.joinRequests || [];
                        if(!c.joinRequests.find(r=>r.memberId===data.memberId)) c.joinRequests.push({memberId:data.memberId, name:currentUser.name});
                        localStorage.setItem(DB_KEY, JSON.stringify(db));
                        res({ success:true, pending:true });
                    }
                }
                else if (data.action === 'get_db') {
                    res({ success:true, db: db.circles[data.circleId] });
                }
                else if (data.action === 'save_admin') {
                    const c = db.circles[data.circleId];
                    if(data.name) c.name = data.name;
                    c.totalTarget = data.totalTarget;
                    c.discordWebhook = data.discordWebhook;
                    c.discordInvite = data.discordInvite;
                    c.adminId = data.adminId; if(data.adminPass) c.adminPass=data.adminPass;
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success:true });
                }
                else if (data.action === 'get_ranking') {
                    const ranking = Object.keys(db.circles).map(id => {
                        const c = db.circles[id];
                        const total = Object.values(c.fans).reduce((a,b)=>a+b,0);
                        return { id:id, name:c.name, totalFans:total };
                    }).sort((a,b)=>b.totalFans-a.totalFans);
                    res({ success:true, ranking:ranking });
                }
                else if (data.action === 'upload') {
                    const c = db.circles[data.circleId];
                    c.fans[data.memberId] = (c.fans[data.memberId]||0) + 120000;
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({ success:true, detectedFans: 120000 });
                }
                else if (data.action === 'handle_join_request') {
                    const c = db.circles[data.circleId];
                    c.joinRequests = (c.joinRequests||[]).filter(r=>r.memberId!==data.applicantId);
                    if (data.accept) {
                        c.members.push({memberId:data.applicantId, name:data.applicantId}); // Simplified
                        if(!db.userToCircles[data.applicantId]) db.userToCircles[data.applicantId]=[];
                        db.userToCircles[data.applicantId].push(data.circleId);
                    }
                    localStorage.setItem(DB_KEY, JSON.stringify(db));
                    res({success:true});
                }
            }, 100);
        });
    }
});
