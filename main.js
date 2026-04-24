const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzyyeoQXI8HD9bVfAY5Eg3XMql5A9Ae2SS14YNrrhKECKYXcW-zJ8COsW8_FjKzjUk/exec'; 
let DISCORD_CLIENT_ID = '1497168159210340484';

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ const s=document.getElementById('toast'); if(!s) return; s.textContent=m; s.className=`toast show ${t}`; setTimeout(()=>s.classList.remove('show'),3000); }

async function callBackend(p) {
    if (GAS_ENDPOINT && p.action === 'postTimeline') {
        try {
            fetch(GAS_ENDPOINT, { method: 'POST', mode: 'no-cors', body: JSON.stringify({ ...p, currentUser: currentUser }) });
        } catch (e) { console.error("GAS Push Error:", e); }
    }

    let db = JSON.parse(localStorage.getItem(DB_KEY));
    if (!db) { 
        db = { circles: {}, userToCircles: {}, globalWisdom: [], masterConfig: { aiKey: 'AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg' } }; 
    }
    if (db.masterConfig && !db.masterConfig.aiKey) {
        db.masterConfig.aiKey = 'AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg';
    }
    if (!db.circles['circle-1']) { 
        db.circles['circle-1'] = { id: 'circle-1', name: 'NPC@サークル', members: {}, timeline: [], ownerId: 'guest' }; 
    }

    if (p.action === 'init' || p.action === 'getAllCircles') return db;
    
    let cid = p.circleId || (currentCircle ? currentCircle.id : 'circle-1');
    if (!db.circles[cid]) cid = 'circle-1';
    let targetCircle = db.circles[cid];

    if (!targetCircle) targetCircle = db.circles[cid] = { id: cid, name: '新規サークル', members: {}, timeline: [] };
    if (!targetCircle.members) targetCircle.members = {};
    if (!targetCircle.timeline) targetCircle.timeline = [];

    if (p.action === 'getCircleData') return { success: true, circle: targetCircle };
    if (p.action === 'updateConfig') { 
        if(p.name) targetCircle.name = p.name; 
        if(p.inviteCode) targetCircle.inviteCode = p.inviteCode;
        if(p.circleTotalTarget !== undefined) targetCircle.circleTotalTarget = p.circleTotalTarget;
        localStorage.setItem(DB_KEY, JSON.stringify(db)); 
        return { success: true }; 
    }
    
    if (p.action === 'findCircleByCode') {
        const found = Object.values(db.circles).find(c => c.inviteCode === p.code);
        return { success: !!found, circleId: found ? found.id : null };
    }
    if (p.action === 'updateMasterConfig') { if(!db.masterConfig) db.masterConfig = { aiKey: '' }; db.masterConfig.aiKey = p.aiKey; localStorage.setItem(DB_KEY, JSON.stringify(db)); return { success: true }; }
    
    if (p.action === 'postTimeline') {
        targetCircle.timeline.push({ userName: p.userName || 'Unknown', text: p.text || '', time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), images: p.images || [], aiComment: p.aiComment });
        try {
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            return { success: true };
        } catch(e) {
            for (let circ of Object.values(db.circles)) {
                if (circ.timeline) circ.timeline = circ.timeline.slice(-10);
            }
            localStorage.setItem(DB_KEY, JSON.stringify(db));
            return { success: true };
        }
    }
    
    if (p.action === 'updateFans') {
        const uid = currentUser?.id || 'guest';
        let m = targetCircle.members[uid]; 
        if(!m) m = targetCircle.members[uid] = { name: (currentUser?.name || 'Guest'), totalFans: 0, targetFans: 3000000, history: [], icon: (currentUser?.avatar || '') };
        m.totalFans = parseInt(p.fans) || 0; 
        if(!m.history) m.history = [];
        m.history.push(m.totalFans);
        targetCircle.totalFans = Object.values(targetCircle.members).reduce((s,x)=>s+(parseInt(x.totalFans)||0), 0); 
        localStorage.setItem(DB_KEY, JSON.stringify(db)); 
        return { success: true };
    }

    if (p.action === 'updateAllTargets') {
        targetCircle.defaultTarget = p.target;
        Object.values(targetCircle.members).forEach(m => { m.targetFans = p.target; });
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true };
    }

    if (p.action === 'updateSingleMemberTarget') {
        const m = targetCircle.members[p.memberId];
        if (m) { m.targetFans = p.target; localStorage.setItem(DB_KEY, JSON.stringify(db)); }
        return { success: true };
    }

    if (p.action === 'joinCircle') {
        if (!db.userToCircles[currentUser.id]) db.userToCircles[currentUser.id] = [];
        if (!db.userToCircles[currentUser.id].includes(p.circleId)) db.userToCircles[currentUser.id].push(p.circleId);
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true };
    }

    if (p.action === 'createCircle') {
        const cid = 'circle-' + Date.now();
        const uid = currentUser?.id || 'guest';
        db.circles[cid] = { id: cid, name: p.name, members: {}, timeline: [], ownerId: uid, defaultTarget: 3000000 };
        db.circles[cid].members[uid] = { name: (currentUser?.name || 'Trainer'), totalFans: 0, targetFans: 3000000, history: [], icon: (currentUser?.avatar || '') };
        if (!db.userToCircles[uid]) db.userToCircles[uid] = [];
        db.userToCircles[uid].push(cid);
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true, circleId: cid };
    }

    if (p.action === 'transferOwner') {
        targetCircle.ownerId = p.newOwnerId;
        localStorage.setItem(DB_KEY, JSON.stringify(db));
        return { success: true };
    }
    
    return db;
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- Login Logic ---
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
    
    await callBackend({ action: 'init' });
    
    const urlParams = new URLSearchParams(window.location.search);
    let joinCid = urlParams.get('join');
    if (joinCid) sessionStorage.setItem('pendingJoin', joinCid);
    else joinCid = sessionStorage.getItem('pendingJoin');

    async function handleAutoJoin() {
        if (joinCid && currentUser) {
            sessionStorage.removeItem('pendingJoin');
            window.history.replaceState({}, document.title, window.location.pathname);
            let targetId = joinCid;
            const findRes = await callBackend({ action: 'findCircleByCode', code: joinCid });
            if (findRes.success) targetId = findRes.circleId;
            showToast("招待URLからサークルに参加中...");
            await callBackend({ action: 'joinCircle', circleId: targetId });
            loginToCircle(targetId);
        }
    }
    
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            if(authOverlay) authOverlay.classList.add('hidden');
            if (joinCid) await handleAutoJoin();
            else showPortal();
        } catch(e) { console.error("Auth Fail", e); showPortal(); }
    }

    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        const pName = document.getElementById('portalUserName'); if(pName && currentUser) pName.textContent = currentUser.name;
        const ava = document.getElementById('portalUserAvatar'); if(currentUser?.avatar && ava) ava.style.backgroundImage = `url('${currentUser.avatar}')`;
        const createBtn = document.getElementById('createNewCircleBtn');
        if(createBtn) createBtn.onclick = async () => {
            const name = prompt("サークル名を入力:");
            if (name) {
                const res = await callBackend({ action: 'createCircle', name: name });
                showToast(`サークル『${name}』を設立！`);
                renderPortalCircles();
                loginToCircle(res.circleId);
            }
        };
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList'); if(!myList) return;
        const resultsList = document.getElementById('searchResultsList'); if(!resultsList) return;
        myList.innerHTML = ''; resultsList.innerHTML = '';
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
        const res = await callBackend({ action: 'getCircleData', circleId: cid });
        if (res.success) {
            currentCircle = res.circle;
            const uid = currentUser?.id || 'guest';
            if (!currentCircle.members[uid]) {
                const def = currentCircle.defaultTarget || 3000000;
                currentCircle.members[uid] = { name: (currentUser?.name || 'Trainer'), totalFans: 0, targetFans: def, history: [], icon: (currentUser?.avatar || '') };
                await callBackend({ action: 'updateFans', circleId: cid, fans: 0 });
            }
            if(portalOverlay) portalOverlay.classList.add('hidden');
            if(appWrapper) appWrapper.style.display = 'flex';
            const n = document.getElementById('userNameDisplay'); if(n && currentUser) n.textContent = currentUser.name;
            const uava = document.getElementById('userAvatar'); if(currentUser?.avatar && uava) uava.style.backgroundImage = `url('${currentUser.avatar}')`;
            await updateDataAndUI();
        }
    }

    async function updateDataAndUI() {
        const res = await callBackend({ action: 'getCircleData', circleId: currentCircle?.id || 'circle-1' });
        if(res.success) { currentCircle = res.circle; updateDashboard(); }
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

    // --- Components ---
    function renderGrowthChart() {
        const ctx = document.getElementById('growthChart'); if(!ctx || !currentCircle) return;
        const uid = currentUser?.id || 'guest';
        const my = currentCircle.members[uid] || { history: [] };
        let h = (my.history && my.history.length > 0) ? my.history : [0];
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line',
            data: { labels: h.map((_,i)=>`i${i}`), datasets: [{ label: 'Fans', data: h, borderColor: '#fba1ba', fill: true, tension: 0.3 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true}} }
        });
    }

    function renderMembers() {
        const g = document.getElementById('membersGrid'); if(!g) return;
        g.innerHTML = '';
        Object.values(currentCircle.members || {}).forEach(m => {
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = (m.name || 'U').substring(0,1);
            g.appendChild(d);
        });
    }

    function renderTimeline() {
        const list = document.getElementById('timelineList'); if(!list) return;
        list.innerHTML = '';
        const posts = (currentCircle.timeline || []).slice().reverse();
        if(posts.length === 0) { list.innerHTML = '<div style="text-align:center; padding:20px; opacity:0.5;">No Posts</div>'; return; }
        posts.forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header">${p.userName} <span class="timeline-time">${p.time}</span></div><div class="timeline-content">${p.text}</div>`;
            if(p.images && p.images.length > 0) {
                let ig = `<div style="display:flex; gap:5px; margin-top:5px;">${p.images.map(img=>`<img src="${img}" style="width:40px; border-radius:5px;">`).join('')}</div>`;
                div.innerHTML += ig;
            }
            list.appendChild(div);
        });
    }

    async function renderAIWisdom() {
        const area = document.getElementById('aiWisdomContent'); if(!area) return;
        const db = await callBackend({ action: 'getAllCircles' });
        area.innerHTML = (db.globalWisdom || []).map(w => `<div class="wisdom-tip">${w.text}</div>`).join('') || "待機中...";
    }

    // --- Admin Event Listeners (Moved INSIDE DOMContentLoaded) ---
    const adminBtn = document.getElementById('adminBtn'); 
    if(adminBtn) adminBtn.onclick = (e) => { e.preventDefault(); const am = document.getElementById('admin-modal'); if(am) { am.classList.remove('hidden'); renderAdminMembers(); } };

    const closeAdmin = document.getElementById('closeAdmin');
    if(closeAdmin) closeAdmin.onclick = () => { const am = document.getElementById('admin-modal'); if(am) am.classList.add('hidden'); };

    window.renderAdminMembers = () => {
        const list = document.getElementById('adminMemberList'); if(!list || !currentCircle) return;
        list.innerHTML = '';
        const uid = currentUser?.id || 'guest';
        const isOwner = (currentCircle.ownerId === uid || !currentCircle.ownerId);

        Object.keys(currentCircle.members || {}).forEach(mid => {
            const m = currentCircle.members[mid];
            const div = document.createElement('div');
            div.style = "display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid rgba(0,0,0,0.05);";
            
            let actBtn = isOwner && mid !== uid ? `<button class="glass-btn primary" onclick="transferLeader('${mid}', '${m.name}')">👑 譲渡</button>` : '';
            div.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px; flex:1;">
                    <div class="member-avatar-mini" style="background-image:url('${m.icon || ''}'); background-size:cover; width:30px; height:30px;">${m.icon ? '' : m.name.substring(0,1)}</div>
                    <div style="flex:1;">
                        <div style="font-weight:bold; font-size:11px;">${m.name}</div>
                        <div style="display:flex; align-items:center; gap:5px; margin-top:4px;">
                            <input type="number" value="${m.targetFans || 3000000}" id="targetInput-${mid}" class="glass-input" style="font-size:10px; width:80px; height:24px;">
                            <button class="glass-btn primary" style="font-size:10px; padding:2px 8px; height:24px;" onclick="updateIndividualTarget('${mid}', '${m.name}')">🎯</button>
                        </div>
                    </div>
                </div>
                <div style="text-align:right;">
                    <div style="font-size:10px; opacity:0.6;">${(m.totalFans||0).toLocaleString()}</div>
                    ${actBtn}
                </div>
            `;
            list.appendChild(div);
        });
    };

    window.updateIndividualTarget = async (uid, name) => {
        const val = parseInt(document.getElementById(`targetInput-${uid}`).value) || 3000000;
        await callBackend({ action: 'updateSingleMemberTarget', memberId: uid, target: val });
        showToast(`${name} さんの目標を変更！🎯`);
        updateDataAndUI();
    };

    window.transferLeader = async (tid, tname) => {
        if (confirm(`${tname} さんへ譲渡しますか？`)) {
            await callBackend({ action: 'transferOwner', circleId: currentCircle.id, newOwnerId: tid });
            showToast("譲渡完了");
            const am = document.getElementById('admin-modal'); if(am) am.classList.add('hidden');
            updateDataAndUI();
        }
    };

    const saveAdminBtn = document.getElementById('saveAdminBtn');
    if(saveAdminBtn) saveAdminBtn.onclick = async () => {
        const name = document.getElementById('adminCircleNameInput').value;
        const total = parseInt(document.getElementById('adminTotalTargetInput').value) || 0;
        await callBackend({ action: 'updateConfig', name: name, circleTotalTarget: total });
        const am = document.getElementById('admin-modal'); if(am) am.classList.add('hidden');
        showToast('保存しました');
        updateDataAndUI();
    };

    const autoTotalBtn = document.getElementById('setTotalTargetAutoBtn');
    if(autoTotalBtn) autoTotalBtn.onclick = () => {
        const n = parseInt(document.getElementById('adminIndividualTarget').value) || 3000000;
        const total = n * Object.keys(currentCircle.members).length;
        document.getElementById('adminTotalTargetInput').value = total;
    };

    const calcQuotaBtn = document.getElementById('calcQuotaFromTotalBtn');
    if(calcQuotaBtn) calcQuotaBtn.onclick = () => {
        const t = parseInt(document.getElementById('adminTotalTargetInput').value) || 0;
        const q = Math.floor(t / Object.keys(currentCircle.members).length);
        document.getElementById('adminIndividualTarget').value = q;
    };

    const applyTargetBtn = document.getElementById('applyIndividualTargetBtn');
    if(applyTargetBtn) applyTargetBtn.onclick = async () => {
        const t = parseInt(document.getElementById('adminIndividualTarget').value) || 3000000;
        await callBackend({ action: 'updateAllTargets', target: t });
        const am = document.getElementById('admin-modal'); if(am) am.classList.add('hidden');
        showToast(`全員を ${t.toLocaleString()} に更新！`);
        updateDataAndUI();
    };

    const copyInviteBtn = document.getElementById('copyInviteUrlBtn');
    if(copyInviteBtn) copyInviteBtn.onclick = async () => {
        if (!currentCircle.inviteCode) {
            currentCircle.inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase();
            await callBackend({ action: 'updateConfig', inviteCode: currentCircle.inviteCode });
        }
        const url = `${window.location.origin}${window.location.pathname}?join=${currentCircle.inviteCode}`;
        document.getElementById('inviteUrlDisplay').value = url;
        navigator.clipboard.writeText(url).then(() => showToast("招待URLコピー完了！"));
    };

    // --- Image Processing (Minified) ---
    async function compressImage(b, mw=1000){return new Promise(r=>{const i=new Image();i.onload=()=>{const c=document.createElement('canvas');let w=i.width,h=i.height;if(w>mw){h=(mw/w)*h;w=mw;}c.width=w;c.height=h;c.getContext('2d').drawImage(i,0,0,w,h);r(c.toDataURL('image/jpeg',0.7));};i.src=b;});}
    async function callGemini(k,p,i=[]){try{const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${k}`,{method:'POST',body:JSON.stringify({contents:[{parts:[{text:p},...i.map(m=>({inline_data:{mime_type:"image/jpeg",data:m.split(',')[1]}}))]}]})});const d=await r.json();return d.candidates[0].content.parts[0].text;}catch(e){return null;}}

    window.addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const reader = new FileReader();
                reader.onload = async (re) => {
                    const comp = await compressImage(re.target.result);
                    const db = await callBackend({action:'getAllCircles'});
                    if(db.masterConfig.aiKey){
                        showToast("AIスキャン中...");
                        const res = await callGemini(db.masterConfig.aiKey, "数値を数字だけで答えて", [comp]);
                        const f = parseInt((res||"0").replace(/[^0-9]/g,''))||0;
                        if(f>0){ await callBackend({action:'updateFans', fans:f}); updateDataAndUI(); showToast(`更新: ${f.toLocaleString()}人`); }
                    }
                };
                reader.readAsDataURL(item.getAsFile());
            }
        }
    });

    // --- Post Logic ---
    let currentImages = [];
    const postModal = document.getElementById('post-modal');
    const timelineInput = document.getElementById('timelineInput');
    const previewArea = document.getElementById('timelineImagePreview');
    const postBtn = document.getElementById('postTimelineBtn');

    const updatePreview = () => {
        if(!previewArea) return;
        previewArea.innerHTML = '';
        previewArea.style.display = currentImages.length ? 'flex' : 'none';
        currentImages.forEach((img, idx) => {
            const div = document.createElement('div'); div.style = "position:relative; width:60px; height:60px; border:1px solid #ddd; border-radius:5px; overflow:hidden;";
            div.innerHTML = `<img src="${img}" style="width:100%; height:100%; object-fit:cover;"><span style="position:absolute; top:0; right:0; background:rgba(0,0,0,0.5); color:white; padding:0 4px; cursor:pointer;" onclick="removeImage(${idx})">×</span>`;
            previewArea.appendChild(div);
        });
    };
    window.removeImage = (idx) => { currentImages.splice(idx, 1); updatePreview(); };

    if(postBtn) postBtn.onclick = async () => {
        if(!timelineInput.value && currentImages.length === 0) return;
        try {
            postBtn.disabled = true; postBtn.textContent = "送信中...";
            let aiComment = null;
            if(currentImages.length > 0) {
                const db = await callBackend({action:'getAllCircles'});
                if(db.masterConfig.aiKey) {
                    showToast("AI解析中...");
                    aiComment = await callGemini(db.masterConfig.aiKey, "画像からファン数を読み取り、1行目に【FAN_COUNT】:123456のように書いてください。", currentImages);
                    const match = aiComment?.match(/【FAN_COUNT】:\s*([0-9,]+)/);
                    if(match) {
                        const fans = parseInt(match[1].replace(/,/g,'')) || 0;
                        if(fans > 0) { await callBackend({action:'updateFans', fans: fans}); showToast(`ファン数更新: ${fans.toLocaleString()}人`); }
                    }
                }
            }
            await callBackend({ action:'postTimeline', userName: currentUser.name, text: timelineInput.value || "#スクショ投稿", images: currentImages, aiComment: aiComment });
            timelineInput.value = ''; currentImages = []; updatePreview(); postModal.classList.add('hidden');
            await updateDataAndUI();
            showToast("パドックに投稿しました！");
        } catch(e) { showToast("エラー: " + e.message, "error"); }
        finally { postBtn.disabled = false; postBtn.textContent = "送信"; }
    };

    const attach = document.getElementById('attachImgBtn'); if(attach) attach.onclick = () => document.getElementById('timelineImageInput').click();
    const tImgInput = document.getElementById('timelineImageInput'); if(tImgInput) tImgInput.onchange = (e) => {
        const file = e.target.files[0];
        if(file) { const reader = new FileReader(); reader.onload = async (re) => { const comp = await compressImage(re.target.result); currentImages.push(comp); updatePreview(); }; reader.readAsDataURL(file); }
    };

    const openPost = document.getElementById('openPostModalBtn'); if(openPost) openPost.onclick = () => document.getElementById('post-modal').classList.remove('hidden');
    const closePost = document.getElementById('closePostModal'); if(closePost) closePost.onclick = () => document.getElementById('post-modal').classList.add('hidden');
});
