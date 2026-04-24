const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzyyeoQXI8HD9bVfAY5Eg3XMql5A9Ae2SS14YNrrhKECKYXcW-zJ8COsW8_FjKzjUk/exec'; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ const s=document.getElementById('toast'); if(!s) return; s.textContent=m; s.className=`toast show ${t}`; setTimeout(()=>s.classList.remove('show'),3000); }

async function callBackend(p) {
    if (!GAS_ENDPOINT) {
        showToast("サーバー設定（GAS_ENDPOINT）が見つかりません。", "error");
        return null;
    }
    try {
        const response = await fetch(GAS_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ ...p, currentUser: currentUser })
        });
        const result = await response.json();
        return result.success ? result.db : null;
    } catch (e) {
        console.error("Backend Error:", e);
        return null;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginBtn = document.getElementById('discordLoginBtn');
    if (loginBtn) {
        loginBtn.onclick = () => {
            const r = window.location.origin + window.location.pathname;
            window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
        };
    }

    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const appWrapper = document.getElementById('appWrapper');
    
    // Init (Non-blocking)
    callBackend({ action: 'init' });
    
    const urlParams = new URLSearchParams(window.location.search);
    let joinCid = urlParams.get('join');
    if (joinCid) sessionStorage.setItem('pendingJoin', joinCid);
    else joinCid = sessionStorage.getItem('pendingJoin');

    async function handleAutoJoin() {
        if (!joinCid || !currentUser) return;
        sessionStorage.removeItem('pendingJoin');
        window.history.replaceState({}, document.title, window.location.pathname);
        showToast("招待URLからサークルに参加中...");
        let targetId = joinCid;
        const res = await callBackend({ action: 'findCircleByCode', code: joinCid });
        if (res && res.circleId) targetId = res.circleId;
        await callBackend({ action: 'joinCircle', circleId: targetId });
        loginToCircle(targetId);
    }
    
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            if (!userRes.ok) throw new Error();
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            if(authOverlay) authOverlay.classList.add('hidden');
            if (joinCid) await handleAutoJoin(); else showPortal();
        } catch(e) { 
            showToast("ログインに失敗しました。", "error");
            if(authOverlay) authOverlay.classList.add('hidden');
            showPortal();
        }
    }

    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        if(currentUser) {
            const pName = document.getElementById('portalUserName'); if(pName) pName.textContent = currentUser.name;
            const ava = document.getElementById('portalUserAvatar'); if(currentUser.avatar && ava) ava.style.backgroundImage = `url('${currentUser.avatar}')`;
        }
        
        // ログアウト機能の復活
        const logoutBtn = document.getElementById('logoutBtn');
        if(logoutBtn) logoutBtn.onclick = () => {
            currentUser = null;
            authOverlay.classList.remove('hidden');
            portalOverlay.classList.add('hidden');
            window.location.hash = '';
            showToast("ログアウトしました");
        };

        const createBtn = document.getElementById('createNewCircleBtn');
        if(createBtn) createBtn.onclick = async () => {
            const name = prompt("サークル名を入力:");
            if (name) {
                showToast("サークルを作成中...");
                const db = await callBackend({ action: 'createCircle', name: name });
                if(db && db.lastCreatedId) {
                    showToast(`サークル『${name}』を設立！`);
                    renderPortalCircles();
                    loginToCircle(db.lastCreatedId);
                } else if(db) {
                    // フォールバック
                    const newCid = Object.keys(db.circles).sort().pop();
                    loginToCircle(newCid);
                }
            }
        };
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList');
        const resultsList = document.getElementById('searchResultsList');
        if(!myList || !resultsList) return;
        myList.innerHTML = ''; resultsList.innerHTML = '';
        
        if(!db) { myList.innerHTML = "<p style='font-size:10px; opacity:0.5;'>サーバーに接続できません...</p>"; return; }
        
        const userToCircles = db.userToCircles[currentUser?.id] || [];
        userToCircles.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right; background:var(--primary); color:white;">入室</span>`;
            div.onclick = () => loginToCircle(cid); myList.appendChild(div);
        });
        Object.keys(db.circles).forEach(cid => {
            if (userToCircles.includes(cid)) return;
            const c = db.circles[cid];
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style.marginBottom = '10px';
            div.innerHTML = `<span>${c.name}</span> <span class="tag" style="float:right;">参加申請</span>`;
            div.onclick = () => showToast("現在締め切り中です"); resultsList.appendChild(div);
        });
    }

    async function loginToCircle(cid) {
        const db = await callBackend({ action: 'getCircleData', circleId: cid });
        if (db && db.circles[cid]) {
            currentCircle = db.circles[cid];
            if(portalOverlay) portalOverlay.classList.add('hidden');
            if(appWrapper) appWrapper.style.display = 'flex';
            const n = document.getElementById('userNameDisplay'); if(n && currentUser) n.textContent = currentUser.name;
            const uava = document.getElementById('userAvatar'); if(currentUser?.avatar && uava) uava.style.backgroundImage = `url('${currentUser.avatar}')`;
            await updateDataAndUI();
        }
    }

    async function updateDataAndUI() {
        const db = await callBackend({ action: 'getCircleData', circleId: currentCircle?.id });
        if(db && currentCircle) { currentCircle = db.circles[currentCircle.id]; updateDashboard(); }
    }

    function updateDashboard() {
        if(!currentCircle) return;
        const c = currentCircle;
        const uid = currentUser?.id || 'guest';
        const def = c.defaultTarget || 3000000;
        const my = c.members[uid] || { totalFans: 0, targetFans: def, history: [] };
        
        const cName = document.getElementById('circleNameDisplay'); if(cName) cName.textContent = c.name;
        const dt = document.getElementById('displayTotalTarget'); if(dt) dt.textContent = (my.targetFans || def).toLocaleString();
        const dr = document.getElementById('displayRemaining'); if(dr) dr.textContent = Math.max(0, (my.targetFans || def) - (my.totalFans || 0)).toLocaleString();
        const tp = document.getElementById('totalFanProgress'); if(tp) tp.style.width = Math.min(100, ((my.totalFans || 0) / (my.targetFans || def)) * 100) + '%';
        const tpt = document.getElementById('totalFanPercentText'); if(tpt) tpt.textContent = Math.floor(((my.totalFans || 0) / (my.targetFans || def)) * 100) + '%';
        
        const totalGot = Object.values(c.members).reduce((s, m) => s + (m.totalFans || 0), 0);
        const totalGoal = c.circleTotalTarget || (def * Object.keys(c.members).length);
        const mTitle = document.getElementById('masterTotalTitle'); if(mTitle) mTitle.textContent = `${c.name}全体の進捗`;
        const mDisp = document.getElementById('masterTotalFanDisplay'); if(mDisp) mDisp.textContent = `${totalGot.toLocaleString()} / ${totalGoal.toLocaleString()}`;
        const mBar = document.getElementById('masterTotalBar'); if(mBar) mBar.style.width = Math.min(100, (totalGot / totalGoal) * 100) + '%';

        renderGrowthChart(); renderMembers(); renderTimeline(); renderAIWisdom();
    }

    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart'); if(!ctx || !currentCircle) return;
        const h = (currentCircle.members[currentUser?.id]?.history || [0]);
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line', data: { labels: h.map((_,i)=>`i${i}`), datasets: [{ label: 'Fans', data: h, borderColor: '#fba1ba', fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}} }
        });
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); if(!g || !currentCircle) return;
        g.innerHTML = '';
        Object.values(currentCircle.members || {}).forEach(m => {
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = (m.name || 'U').substring(0,1);
            g.appendChild(d);
        });
    }

    function renderTimeline() {
        const list = document.getElementById('timelineList'); if(!list || !currentCircle) return;
        list.innerHTML = '';
        const posts = (currentCircle.timeline || []).slice().reverse();
        posts.forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header">${p.userName} <span class="timeline-time">${p.time}</span></div><div class="timeline-content">${p.text}</div>`;
            if(p.images && p.images.length > 0) div.innerHTML += `<div style="display:flex; gap:5px; margin-top:5px;">${p.images.map(img=>`<img src="${img}" style="width:40px; border-radius:5px;">`).join('')}</div>`;
            list.appendChild(div);
        });
    }

    async function renderAIWisdom() {
        const area = document.getElementById('aiWisdomContent'); if(!area) return;
        const db = await callBackend({ action: 'getAllCircles' });
        if(db) area.innerHTML = (db.globalWisdom || []).map(w => `<div class="wisdom-tip">${w.text}</div>`).join('') || "待機中...";
    }

    // --- Admin ---
    const adminBtn = document.getElementById('adminBtn'); 
    if(adminBtn) adminBtn.onclick = (e) => { e.preventDefault(); document.getElementById('admin-modal').classList.remove('hidden'); renderAdminMembers(); };
    if(document.getElementById('closeAdmin')) document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');

    window.renderAdminMembers = () => {
        const list = document.getElementById('adminMemberList'); if(!list || !currentCircle) return;
        list.innerHTML = ''; 
        const isOwner = (currentCircle.ownerId === currentUser?.id || !currentCircle.ownerId);
        Object.keys(currentCircle.members || {}).forEach(mid => {
            const m = currentCircle.members[mid];
            const div = document.createElement('div'); div.className = "member-row";
            div.style = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;";
            div.innerHTML = `<div style="flex:1;"><div style="font-size:11px; font-weight:bold;">${m.name}</div><input type="number" value="${m.targetFans}" id="targetInput-${mid}" style="width:80px; font-size:10px;"><button class="glass-btn primary" style="font-size:10px;" onclick="updateIndividualTarget('${mid}', '${m.name}')">🎯</button></div><div style="text-align:right; font-size:10px;">${(m.totalFans||0).toLocaleString()}</div>`;
            list.appendChild(div);
        });
    };

    window.updateIndividualTarget = async (uid, name) => {
        const val = parseInt(document.getElementById(`targetInput-${uid}`).value) || 3000000;
        await callBackend({ action: 'updateSingleMemberTarget', circleId: currentCircle.id, memberId: uid, target: val });
        showToast(`${name}の目標を${val.toLocaleString()}に変更！🎯`);
        updateDataAndUI();
    };

    const saveAdminBtn = document.getElementById('saveAdminBtn');
    if(saveAdminBtn) saveAdminBtn.onclick = async () => {
        const name = document.getElementById('adminCircleNameInput').value;
        const total = parseInt(document.getElementById('adminTotalTargetInput').value) || 0;
        await callBackend({ action: 'updateConfig', circleId: currentCircle.id, name: name, circleTotalTarget: total });
        document.getElementById('admin-modal').classList.add('hidden');
        showToast('設定を保存しました');
        updateDataAndUI();
    };

    // --- Image ---
    async function compressImage(b, mw=1000){return new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');let w=i.width,h=i.height;if(w>mw){h=(mw/w)*h;w=mw;}c.width=w;c.height=h;c.getContext('2d').drawImage(i,0,0,w,h);r(c.toDataURL('image/jpeg',0.7));};i.src=b;});}
    async function callGemini(k,p,i=[]){try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`,{method:'POST',body:JSON.stringify({contents:[{parts:[{text:p},...i.map(m=>({inline_data:{mime_type:"image/jpeg",data:m.split(',')[1]}}))]}]})});const d=await r.json();return d.candidates[0].content.parts[0].text;}catch(e){return null;}}

    window.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const reader = new FileReader(); reader.onload = async (re) => {
                    const comp = await compressImage(re.target.result);
                    const db = await callBackend({action:'getAllCircles'});
                    if(db && db.masterConfig.aiKey){
                        showToast("AIスキャン中...");
                        const res = await callGemini(db.masterConfig.aiKey, "数値を数字だけで答えて", [comp]);
                        const f = parseInt((res||"0").replace(/[^0-9]/g,''))||0;
                        if(f>0){ await callBackend({action:'updateFans', circleId: currentCircle?.id, fans:f}); updateDataAndUI(); showToast(`更新: ${f.toLocaleString()}人`); }
                    }
                }; reader.readAsDataURL(item.getAsFile());
            }
        }
    });

    const postBtn = document.getElementById('postTimelineBtn');
    if(postBtn) postBtn.onclick = async () => {
        const input = document.getElementById('timelineInput');
        if(!input.value) return;
        postBtn.disabled = true;
        await callBackend({ action:'postTimeline', circleId: currentCircle.id, text: input.value });
        input.value = ''; document.getElementById('post-modal').classList.add('hidden');
        updateDataAndUI();
        showToast("投稿完了！"); postBtn.disabled = false;
    };
});
