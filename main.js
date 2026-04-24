const DB_KEY = 'uma_mock_db';
const GAS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwYkegOnemTtYiFOLBRVb2TziWLknM6vRU2FutBpOHRaszqWCg1UnU1HUKBhWQikB4X/exec'; 
let DISCORD_CLIENT_ID = '1497168159210340484';
const AI_KEY = 'AIzaSyAzQdz599McEjgJkwN2tGJbfpWNfKIkCSg';

let currentUser = null;
let currentCircle = null;

// --- Helper Functions ---
function showToast(m, t='success'){ 
    const s=document.getElementById('toast'); if(!s) return; 
    s.textContent=m; s.className=`toast show ${t}`; 
    setTimeout(()=>s.classList.remove('show'),3000); 
}

async function callBackend(p) {
    try {
        const response = await fetch(GAS_ENDPOINT, { method: 'POST', body: JSON.stringify({ ...p, currentUser: currentUser }) });
        const result = await response.json();
        return (result && result.success) ? result.db : null;
    } catch (e) { return null; }
}

async function resizeImage(base64Str, maxWidth = 400) {
    return new Promise((resolve) => {
        const img = new Image(); img.src = base64Str;
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = maxWidth / img.width;
            if(scale >= 1) return resolve(base64Str);
            canvas.width = maxWidth; canvas.height = img.height * scale;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', 0.7));
        };
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    const appWrapper = document.getElementById('appWrapper');
    const authOverlay = document.getElementById('authOverlay');
    const portalOverlay = document.getElementById('circleSelectionOverlay');
    const heroCard = document.getElementById('heroCard');

    // --- Auth check ---
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
        if (loginBtn) loginBtn.onclick = () => {
            const r = window.location.origin + window.location.pathname;
            window.location.href = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(r)}&response_type=token&scope=identify`;
        };
    }

    async function showPortal() {
        portalOverlay.classList.remove('hidden');
        if(currentUser) {
            document.getElementById('portalUserName').textContent = currentUser.name;
            document.getElementById('portalUserAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;
        }
        document.getElementById('logoutBtnFromPortal').onclick = () => window.location.reload();
        const scBtn = document.getElementById('showCreateCircleBtn');
        if(scBtn) scBtn.onclick = () => document.getElementById('create-circle-modal').classList.remove('hidden');
        document.getElementById('cancelCreateCircle').onclick = () => document.getElementById('create-circle-modal').classList.add('hidden');
        document.getElementById('confirmCreateCircle').onclick = async () => {
            const name = document.getElementById('newCircleName').value; if(!name) return;
            const db = await callBackend({ action: 'createCircle', name: name });
            if(db) { document.getElementById('create-circle-modal').classList.add('hidden'); renderPortalCircles(); window.loginToCircle(db.lastCreatedId); }
        };
        renderPortalCircles();
    }

    async function renderPortalCircles() {
        const db = await callBackend({ action: 'getAllCircles' });
        const myList = document.getElementById('myCirclesList');
        const resList = document.getElementById('searchResultsList');
        if(!db || !myList || !resList) return;
        myList.innerHTML = ''; resList.innerHTML = '';
        const myIds = db.userToCircles[currentUser?.id] || [];
        myIds.forEach(cid => {
            const c = db.circles[cid]; if(!c) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style = "margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;";
            div.innerHTML = `<span style="font-weight:bold; cursor:pointer;" onclick="window.loginToCircle('${cid}')">${c.name}</span> <button class="text-link" style="color:red;" onclick="window.leaveCircle('${cid}', '${c.name}')">脱退</button>`;
            myList.appendChild(div);
        });
        Object.values(db.circles).forEach(c => {
            if(myIds.includes(c.id)) return;
            const div = document.createElement('div'); div.className = 'glass-btn'; div.style = "margin-bottom:10px;";
            div.innerHTML = `<span>${c.name}</span> <button class="tag-btn" style="float:right;" onclick="window.joinCircle('${c.id}')">加入</button>`;
            resList.appendChild(div);
        });
    }

    window.loginToCircle = async (cid) => {
        const db = await callBackend({ action: 'getCircleData', circleId: cid });
        if (db && db.circles[cid]) {
            currentCircle = db.circles[cid]; portalOverlay.classList.add('hidden'); appWrapper.style.display = 'flex';
            updateDashboard();
        }
    };
    window.joinCircle = async cid => { await callBackend({ action: 'joinCircle', circleId: cid }); renderPortalCircles(); };
    window.leaveCircle = async (cid, n) => { if(confirm(`『${n}』から脱退しますか？`)) { await callBackend({ action:'leaveCircle', circleId: cid }); renderPortalCircles(); } };

    // --- ハイブリッドAI解析 (AI抽出 + 手動確認) ---
    async function handleImageUpload(file) {
        if(!file || !file.type.startsWith('image/')) return;
        showToast("AIがファン数を読み取り中...");
        
        const reader = new FileReader();
        reader.onload = async (ev) => {
            const rawBase64 = ev.target.result;
            const smallBase64 = await resizeImage(rawBase64, 500); 
            const pureBase64 = smallBase64.split(',')[1];

            try {
                // AIに解析させる
                const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${AI_KEY}`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        contents: [{ parts: [
                            { text: "ウマ娘の画面から、『ファン 総獲得数』の右側に記載されている数字だけを抽出して。カンマは不要。数字以外は一切答えないで。" },
                            { inline_data: { mime_type: "image/jpeg", data: pureBase64 } }
                        ]}]
                    })
                });
                const res = await response.json();
                console.log("AI Response:", res);

                if (!res.candidates || res.candidates.length === 0) {
                    const reason = res.promptFeedback ? "安全フィルター等により解析が拒否されました" : "AIから回答が得られませんでした";
                    throw new Error(reason);
                }

                const aiFans = res.candidates[0].content.parts[0].text.trim().replace(/,/g, '');
                
                // 確認ダイアログを出す
                const confirmedFans = prompt(`AIは「${parseInt(aiFans).toLocaleString() || 0}」ファンだと読み取りました。\n修正が必要な場合は書き換えてOKを押してください。`, aiFans);
                
                if (confirmedFans !== null) {
                    const fans = parseInt(confirmedFans.replace(/,/g, ''));
                    if(!isNaN(fans)) {
                        showToast(`ファン数 ${fans.toLocaleString()} を記録しました🏆`);
                        await callBackend({ action: 'updateFans', circleId: currentCircle.id, fans: fans });
                        await callBackend({ action: 'postTimeline', circleId: currentCircle.id, text: `AI解析・確認：ファン数${fans.toLocaleString()}`, images: [smallBase64] });
                        updateDashboard();
                    }
                }
            } catch(e) {
                console.error(e);
                showToast(`解析エラー: ${e.message || "画像の数字が読み取れませんでした"}`, "error");
            }
        };
        reader.readAsDataURL(file);
    }

    window.addEventListener('paste', e => {
        const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image'));
        if(item) handleImageUpload(item.getAsFile());
    });
    if(heroCard) {
        heroCard.ondragover = e => e.preventDefault();
        heroCard.ondrop = e => { e.preventDefault(); handleImageUpload(e.dataTransfer.files[0]); };
        heroCard.onclick = () => {
            const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
            inp.onchange = e => handleImageUpload(e.target.files[0]);
            inp.click();
        };
    }

    // --- Dashboard UI Update ---
    async function updateDashboard() {
        const db = await callBackend({ action: 'getCircleData', circleId: currentCircle.id });
        if(!db) return;
        currentCircle = db.circles[currentCircle.id];
        const c = currentCircle;
        const my = c.members[currentUser?.id] || { totalFans: 0, targetFans: 3000000, history: [] };
        
        document.querySelector('.circle-name-display').textContent = c.name;
        document.getElementById('displayTotalTarget').textContent = (my.targetFans).toLocaleString();
        document.getElementById('displayRemaining').textContent = Math.max(0, my.targetFans - my.totalFans).toLocaleString();
        document.getElementById('totalFanProgress').style.width = Math.min(100, (my.totalFans / my.targetFans) * 100) + '%';
        document.getElementById('totalFanPercentText').textContent = Math.floor((my.totalFans / my.targetFans) * 100) + '%';
        
        document.getElementById('userNameDisplay').textContent = currentUser?.name || "Member";
        if(currentUser?.avatar) document.getElementById('userAvatar').style.backgroundImage = `url('${currentUser.avatar}')`;

        renderTimeline(c.timeline); renderGrowthChart(my.history); renderMembers(c.members);
    }

    function renderTimeline(posts) {
        const list = document.getElementById('timelineList'); if(!list) return;
        list.innerHTML = '';
        (posts || []).slice().reverse().forEach(p => {
            const div = document.createElement('div'); div.className = 'timeline-item';
            div.innerHTML = `<div class="timeline-header">${p.userName} <span style="font-size:10px; opacity:0.5; float:right;">${p.time || ''}</span></div><div class="timeline-content">${p.text}</div>`;
            if(p.images?.length > 0) div.innerHTML += `<img src="${p.images[0]}" style="width:120px; border-radius:10px; margin-top:10px; cursor:zoom-in;" onclick="window.open('${p.images[0]}')">`;
            list.appendChild(div);
        });
    }

    function renderMembers(mbs) {
        const g = document.getElementById('membersGrid'); if(!g) return;
        g.innerHTML = '';
        Object.values(mbs || {}).forEach(m => {
            const d = document.createElement('div'); d.className = 'member-avatar-mini';
            if(m.icon) d.style.backgroundImage = `url('${m.icon}')`; else d.textContent = m.name.substring(0,1);
            g.appendChild(d);
        });
    }

    function renderGrowthChart(h) {
        const ctx = document.getElementById('growthChart'); if(!ctx) return;
        if(window.myChart) window.myChart.destroy();
        window.myChart = new Chart(ctx, {
            type: 'line', data: { labels: h.map((_,i)=>i), datasets: [{ data: h, borderColor: '#fba1ba', tension: 0.3, fill: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:false}} }
        });
    }

    document.getElementById('switchCircleBtn').onclick = () => { appWrapper.style.display = 'none'; showPortal(); };
    document.getElementById('adminBtn').onclick = () => document.getElementById('admin-modal').classList.remove('hidden');
    document.getElementById('closeAdmin').onclick = () => document.getElementById('admin-modal').classList.add('hidden');
});
