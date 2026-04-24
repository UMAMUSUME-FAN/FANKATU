/* 
   Google Apps Script (GAS) 用 テンプレートコード
   
   【使い方】
   1. Googleスプレッドシートの「拡張機能」>「Apps Script」を開く
   2. 元々あるコードを消して、これを貼り付ける
   3. 「デプロイ」>「新しいデプロイ」をクリック
   4. 種類を「ウェブアプリ」にし、アクセスできるユーザーを「全員」にして公開
   5. 発行されたURLを、main.js の GAS_ENDPOINT に貼り付ける
*/

function doPost(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheets()[0]; // 1番目のシートに書き込む
  
  try {
    var data = JSON.parse(e.postData.contents);
    
    // シートのヘッダーが空なら作成
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["日時", "ユーザー名", "メッセージ", "AIデータ抽出・文字起こし"]);
    }
    
    // パドック投稿アクションの時のみ、スプレッドシートに追記
    if (data.action === 'postTimeline') {
      sheet.appendRow([
        new Date(),
        data.userName,
        data.text,
        data.aiComment || "なし"
      ]);
      
      return ContentService.createTextOutput(JSON.stringify({success: true, message: "Logged to Spreadsheet"}))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    return ContentService.createTextOutput(JSON.stringify({success: true, message: "Action received but non-paddock"}))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({success: false, error: err.toString()}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
