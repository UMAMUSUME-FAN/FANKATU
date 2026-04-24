const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwYkegOnemTtYiFOLBRVb2TziWLknM6vRU2FutBpOHRaszqWCg1UnU1HUKBhWQikB4X/exec'; 
let DISCORD_CLIENT_ID = '1497168159210340484';

// AI (Gemini) 設定 - 本来はサーバーから取得が理想ですが、利便性のため保持
const AI_KEY = 'AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg'; 

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ 
    const s=document.getElementById('toast'); 
    if(!s) return; 
    s.textContent=m; s.className=`toast show ${t}`; 
    setTimeout(()=>s.classList.remove('show'),3000); 
}

async function callBackend(p) {
    if (!GAS_ENDPOINT) { showToast("サーバー設定エラー", "error"); return null; }
    try {
        const response = await fetch(GAS_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify({ ...p, currentUser: currentUser })
        });
        const result = await response.json();
        return (result && result.success) ? result.db : null;
    } catch (e) { console.error("Backend Error:", e); return null; }
}

document.addEventListener('DOMContentLoaded', async () => {
    // --- Dashboard UI ---
    const appWrapper = document.getElementById('appWrapper');
    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const heroCard = document.getElementById('heroCard');

    // --- Auth Check ---
    const params = new URLSearchParams(window.location.hash.substring(1));
    const token = params.get('access_token');
    
    if (token) {
        window.history.replaceState({}, document.title, window.location.pathname);
        try {
            const userRes = await fetch('https://discord.com/api/users/@me', { headers: { Authorization: `Bearer ${token}` } });
            const du = await userRes.json();
            currentUser = { id: du.id, name: du.username, avatar: `https://cdn.discordapp.com/avatars/${du.id}/${du.avatar}.png` };
            if (authOverlay) authOverlay.classList.add('hidden');
            showPortal();
        } catch(e) { showToast("ログイン失敗", "error"); }
    } else {
        const loginBtn = document.getElementById('discordLoginBtn');
        if (loginBtn) {
            loginBtn.onclick = () => {
                const r = window.location.origin + window.location.pathname;
                window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
            };
        }
    }

    // --- Portal ---
    async function showPortal() {
        if(!portalOverlay) return;
        portalOverlay.classList.remove('hidden');
        if(currentUser) {
            document.getElementById('portalUserName').textContent = currentUser.name;
            document.getElementById('portalUserAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;
        }
        
        const logoutBtn = document.getElementById('logoutBtnFromPortal');
        if(logoutBtn) logoutBtn.onclick = () => window.location.reload();

        const showCreateBtn = document.getElementById('showCreateCircleBtn');
        const createModal = document.getElementById('create-circle-modal');
        if(showCreateBtn && createModal) {
            showCreateBtn.onclick = () => createModal.classList.remove('hidden');
            document.getElementById('cancelCreateCircle').onclick = () => createModal.classList.add('hidden');
            document.getElementById('confirmCreateCircle').onclick = async () => {
                const name = document.getElementById('newCircleName').value;
                if(!name) return;
                showToast("サークル設立中...");
                const db = await callBackend({ action: 'createCircle', name: name });
                if(db && db.lastCreatedId) {
                    createModal.classList.add('hidden');
                    renderPortalCircles();
                    window.loginToCircle(db.lastCreatedId);
                }
            };
        }
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList');
        const resList = document.getElementById('searchResultsList');
        if(!myList || !resList || !db) return;
        myList.innerHTML = ''; resList.innerHTML = '';
        const myIds = db.userToCircles[currentUser?.id] || [];
        myIds.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style = "margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `<span style="font-weight:bold; cursor:pointer;" onclick="window.loginToCircle('${cid}')">${c.name} (入室)</span> <button class="text-link" onclick="window.leaveCircle('${cid}', '${c.name}')">脱退</button>`;
            myList.appendChild(div);
        });
        Object.values(db.circles).forEach(c => {
            if(myIds.includes(c.id)) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style = "margin-bottom:10px;";
            div.innerHTML = `<span>${c.name}</span> <button class="tag-btn" style="float:right;" onclick="window.joinCircle('${c.id}', '${c.name}')">加入</button>`;
            resList.appendChild(div);
        });
    }

    // --- Global Window Actions ---
    window.loginToCircle = async (cid) => {
        const db = await callBackend({ action: 'getCircleData', circleId: cid });
        if (db && db.circles[cid]) {
            currentCircle = db.circles[cid];
            portalOverlay.classList.add('hidden');
            appWrapper.style.display = 'flex';
            updateDashboard();
        }
    };
    window.joinCircle = async (cid) => { 
        await callBackend({ action: 'joinCircle', circleId: cid }); 
        showToast("サークルに加入しました"); renderPortalCircles(); 
    };
    window.leaveCircle = async (cid, n) => {
        if(confirm(`『${n}』から脱退しますか？`)) {
            await callBackend({ action:'leaveCircle', circleId: cid });
            showToast("脱退しました"); renderPortalCircles();
        }
    };

    // --- IMAGE AI ANALYSIS (OCR) ---
    async function handleImageUpload(file) {
        if(!file || !file.type.startsWith('image/')) return;
        showToast("AIがファン数を読み取り中...");
        
        const reader = new FileReader();
        reader.onload = async (e) => {
            const base64Data = e.target.result.split(',')[1];
            try {
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${AI_KEY}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{
                            parts: [
                                { text: "ウマ娘の『ファン数』の数字だけを抜き出して答えて。カンマ不要。数字以外は一切答えないで。" },
                                { inline_data: { mime_type: "image/png", data: base64Data } }
                            ]
                        }]
                    })
                });
                const res = await response.json();
                const text = res.candidates[0].content.parts[0].text.trim().replace(/,/g, '');
                const fans = parseInt(text);
                if (!isNaN(fans)) {
                    showToast(`ファン数 ${fans.toLocaleString()} を検出！`);
                    await callBackend({ action: 'updateFans', circleId: currentCircle.id, fans: fans });
                    await callBackend({ action: 'postTimeline', circleId: currentCircle.id, text: `ファン数更新：${fans.toLocaleString()}`, images: [e.target.result] });
                    updateDashboard();
                } else { throw new Error(); }
            } catch(err) { showToast("AI解析に失敗しました", "error"); }
        };
        reader.readAsDataURL(file);
    }

    // Capture Paste Event
    window.addEventListener('paste', (e) => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image'));
        if(item) handleImageUpload(item.getAsFile());
    });
    if(heroCard) {
        heroCard.ondragover = (e) => { e.preventDefault(); heroCard.style.borderColor = 'var(--primary)'; };
        heroCard.ondragleave = () => { heroCard.style.borderColor = 'rgba(251,161,186,0.2)'; };
        heroCard.ondrop = (e) => { e.preventDefault(); handleImageUpload(e.dataTransfer.files[0]); };
    }

    // --- Dashboard Functions ---
    async function updateDashboard() {
        const db = await callBackend({ action: 'getCircleData', circleId: currentCircle.id });
        if(!db) return;
        currentCircle = db.circles[currentCircle.id];
        const c = currentCircle;
        const my = c.members[currentUser?.id] || { totalFans: 0, targetFans: 3000000, history: [] };
        
        document.getElementById('circleNameDisplay').textContent = c.name;
        document.getElementById('displayTotalTarget').textContent = (my.targetFans).toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, my.targetFans - my.totalFans).toLocaleString();
        document.getElementById('totalFanProgress').style.width = Math.min(100, (my.totalFans / my.targetFans) * 100) + '%';
        document.getElementById('totalFanPercentText').textContent = Math.floor((my.totalFans / my.targetFans) * 100) + '%';
        
        document.getElementById('userNameDisplay').textContent = currentUser?.name || "Member";
        if(currentUser?.avatar) document.getElementById('userAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;

        // Timeline & Members UI Refreshes (Omitted for brevity, but needed for full sync)
        renderTimeline(c.timeline);
        renderGrowthChart(my.history);
    }

    function renderTimeline(posts) {
        const list = document.getElementById('timelineList'); if(!list) return;
        list.innerHTML = '';
        (posts || []).slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header">${p.userName}</div><div class="timeline-content">${p.text}</div>`;
            if(p.images?.length > 0) div.innerHTML += `<img src="${p.images[0]}" style="width:100px; border-radius:10px; margin-top:10px;">`;
            list.appendChild(div);
        });
    }

    function renderGrowthChart(h) {
        const ctx = document.getElementById('growthChart'); if(!ctx) return;
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line', data: { labels: h.map((_,i)=>i), datasets: [{ data: h, borderColor: '#fba1ba', fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}} }
        });
    }

    // General UI Events
    document.getElementById('switchCircleBtn').onclick = () => { appWrapper.style.display = 'none'; showPortal(); };
    document.getElementById('adminBtn').onclick = () => document.getElementById('admin-modal').classList.remove('hidden');
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
});
