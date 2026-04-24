/**
 * Google Apps Script バックエンド（パスワード付き・個別マイページ対応版）
 * 役割: ユーザー認証、OCR解析、DB(スプレッドシート)操作、画像保存
 */

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID'; // スプレッドシートのID
const FOLDER_ID = 'YOUR_FOLDER_ID';           // 画像を保存するGoogleドライブのフォルダID
const VISION_API_KEY = 'YOUR_API_KEY';        // Google Cloud Vision APIのキー

function doPost(e) {
  // CORSプリフライトエラーを回避し、JSONを返すための基本設定
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    let result;
    if (action === 'register') {
      result = handleRegister(data);
    } else if (action === 'login') {
      result = handleLogin(data);
    } else if (action === 'upload') {
      result = handleUpload(data);
    } else if (action === 'update_profile') {
      result = handleUpdateProfile(data);
    } else {
      throw new Error('無効なアクションです');
    }
    
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============== データベース(スプレッドシート)の初期化・取得 ==============
function getSheet(sheetName) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(sheetName);
  
  // シートが存在しない場合は自動で作成し、ヘッダー行を入れる
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    if (sheetName === 'Members') {
      sheet.appendRow(['MemberId', 'Name', 'Password', 'IconBase64', 'CreatedAt']);
    } else if (sheetName === 'Uploads') {
      sheet.appendRow(['Timestamp', 'MemberId', 'Name', 'FileName', 'FanCount', 'FileUrl']);
    }
  }
  return sheet;
}

// ============== メンバー登録処理 ==============
function handleRegister(data) {
  const sheet = getSheet('Members');
  const values = sheet.getDataRange().getValues();
  
  // 最大30人の上限チェック (ヘッダー行があるので data.length > 30 になったら制限)
  if (values.length > 30) throw new Error('メンバーの登録上限（30人）に達しています。');
  
  // 名前のかぶりチェック
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === data.name) throw new Error('その名前はすでに登録されています。別の名前にしてください。');
  }
  
  const memberId = 'M' + new Date().getTime();
  // デフォルトアイコンを空で保存
  sheet.appendRow([memberId, data.name, data.password, '', new Date()]);
  
  return { success: true, memberId: memberId, name: data.name };
}

// ============== ログイン処理 ==============
function handleLogin(data) {
  const sheet = getSheet('Members');
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][1] === data.name && values[i][2] === data.password) {
      return { 
        success: true, 
        memberId: values[i][0], 
        name: values[i][1],
        icon: values[i][3] || '' // カスタムアイコンがあれば返す
      };
    }
  }
  throw new Error('名前かパスワードが間違っています。');
}

// ============== プロフィール(アイコン)更新 ==============
function handleUpdateProfile(data) {
  const sheet = getSheet('Members');
  const values = sheet.getDataRange().getValues();
  
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === data.memberId) {
      // D列（4列目）のアイコンデータを更新
      sheet.getRange(i + 1, 4).setValue(data.icon);
      return { success: true };
    }
  }
  throw new Error('メンバーが見つかりません。');
}

// ============== 画像アップロードとOCR解析 ==============
function handleUpload(data) {
  if (!data.image) throw new Error('画像データがありません。');
  
  // 1. Googleドライブに画像を証拠として保存
  const folder = DriveApp.getFolderById(FOLDER_ID);
  const blob = Utilities.newBlob(Utilities.base64Decode(data.image), 'image/jpeg', data.filename || 'upload.jpg');
  const file = folder.createFile(blob);
  
  // 2. OCRで抽出（デモ段階ではコメントアウトしておき、本番でオンにするのがおすすめ）
  let fanCount = analyzeImageWithVision(data.image) || 0;
  
  // 3. アップロード履歴シートに追記
  const sheet = getSheet('Uploads');
  sheet.appendRow([new Date(), data.memberId, data.name, data.filename || 'upload.jpg', fanCount, file.getUrl()]);
  
  // 稼いだファン数を返す
  return { success: true, detectedFans: fanCount, url: file.getUrl() };
}

// ============== Vision API 連携 ==============
function analyzeImageWithVision(base64Image) {
  const url = 'https://vision.googleapis.com/v1/images:annotate?key=' + VISION_API_KEY;
  const payload = {
    requests: [{
      image: { content: base64Image },
      features: [{ type: 'TEXT_DETECTION' }]
    }]
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const result = JSON.parse(response.getContentText());
  
  if (!result.responses[0].fullTextAnnotation) return 0;
  
  const fullText = result.responses[0].fullTextAnnotation.text;
  const numbers = fullText.match(/\d{1,3}(,\d{3})*/g);
  if (numbers) {
      const candidates = numbers.map(n => parseInt(n.replace(/,/g, '')));
      return Math.max(...candidates); 
  }
  return 0;
}
