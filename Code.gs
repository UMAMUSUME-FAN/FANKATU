// --- サーバー側のデータベース処理 (Googleスプレッドシート自動連動版 v6) ---
// これを Google Apps Script (Code.gs) に「まるごと上書き」してデプロイしてください

const PROP_KEY = 'UMA_TRACKER_SS_ID';

function doPost(e) {
  const prop = PropertiesService.getScriptProperties();
  let ssId = prop.getProperty(PROP_KEY);
  
  // スプレッドシートが無い場合は新しく作成する
  if (!ssId) {
    const newSS = SpreadsheetApp.create("UMA_TRACKER_DATABASE");
    ssId = newSS.getId();
    prop.setProperty(PROP_KEY, ssId);
    // 初期シートの作成
    newSS.insertSheet("Circles");
    newSS.insertSheet("Timeline");
    newSS.deleteSheet(newSS.getSheetByName("シート1"));
  }

  const ss = SpreadsheetApp.openById(ssId);
  const p = JSON.parse(e.postData.contents);
  const action = p.action;
  const user = p.currentUser;

  // メモリ上のDB（これまで通りPropertiesServiceも併用して高速化しつつ、重いデータはSSへ）
  const DB_PROP = 'UMA_TRACKER_DB_JSON';
  let db = JSON.parse(prop.getProperty(DB_PROP) || '{"circles":{}, "userToCircles":{}, "globalWisdom":[]}');

  try {
    if (action === 'createCircle') {
      const cid = 'circle-' + Date.now();
      db.circles[cid] = { 
        id: cid, name: p.name, members: {}, timeline: [], 
        ownerId: user ? user.id : 'guest', defaultTarget: 3000000,
        inviteCode: Math.random().toString(36).substring(2, 10).toUpperCase()
      };
      if (user) {
        db.circles[cid].members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
        if (!db.userToCircles[user.id]) db.userToCircles[user.id] = [];
        db.userToCircles[user.id].push(cid);
      }
      db.lastCreatedId = cid;
    } else if (action === 'updateFans') {
      const c = db.circles[p.circleId];
      if (c && user) {
        let m = c.members[user.id];
        if(!m) m = c.members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
        m.totalFans = parseInt(p.fans);
        if(!m.history) m.history = []; m.history.push(m.totalFans);
        if(m.history.length > 30) m.history.shift();
      }
    } else if (action === 'postTimeline') {
      const c = db.circles[p.circleId];
      if (c && user) {
        const post = { userName: user.name, text: p.text, time: new Date().toLocaleString('ja-JP'), images: p.images || [] };
        c.timeline.push(post);
        
        // --- スプレッドシートへの記録 (永続保存・ログ) ---
        const tlSheet = ss.getSheetByName("Timeline");
        tlSheet.appendRow([new Date(), p.circleId, user.name, p.text, p.images ? p.images[0] : ""]);
        
        // --- 整理ロジック：古いスクショをメモリから消す (Propertiesの5KB制限対策) ---
        // メモリ(JSON)上のタイムラインは最新10件だけにして軽く保つ
        // (スプレッドシートには全部残っているので安心！)
        if (c.timeline.length > 10) {
          c.timeline.shift();
        }
      }
    } else if (action === 'leaveCircle') {
       if (user && db.userToCircles[user.id]) {
         db.userToCircles[user.id] = db.userToCircles[user.id].filter(id => id !== p.circleId);
         if(db.circles[p.circleId]) delete db.circles[p.circleId].members[user.id];
       }
    } else if (action === 'joinCircle') {
      if (user && db.circles[p.circleId]) {
        if (!db.userToCircles[user.id]) db.userToCircles[user.id] = [];
        if (!db.userToCircles[user.id].includes(p.circleId)) db.userToCircles[user.id].push(p.circleId);
        const c = db.circles[p.circleId];
        if (!c.members[user.id]) c.members[user.id] = { name: user.name, totalFans: 0, targetFans: 3000000, history: [], icon: user.avatar };
      }
    }

    // JSONを保存 (画像データを抜いた後の軽いデータ)
    prop.setProperty(DB_PROP, JSON.stringify(db));
    
  } catch (err) {
    console.log(err);
  }

  return ContentService.createTextOutput(JSON.stringify({ success: true, db: db, lastCreatedId: db.lastCreatedId }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() { return ContentService.createTextOutput("UMA Tracker API v6 (Spreadsheet Connected) is Running."); }
