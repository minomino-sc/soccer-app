二宮家ファミリーカレンダー 初期ファイル

1. この family フォルダを soccer-app リポジトリ直下に置きます。
   URLは https://minomino-sc.github.io/soccer-app/family/ になります。

2. firebase.js の XXXXX 部分を Firebase Console の Webアプリ設定値で置き換えます。
   Firebase Console > プロジェクトの設定（歯車）> 全般 > マイアプリ

3. Firestore に family_calendar_events コレクションを使います。
   現在のルールにはこのコレクションの許可がないため、読み書きできるようにする必要があります。
   まずは家族内で使う簡易パスワード方式です。これはデータベース側の認証ではありません。

4. app.js の FAMILY_PASSWORD が専用パスワードです。
   パスワードを変更するときはここを書き換えます。

5. 利用者名は index.html の memberSelect の option を家族の名前に変更してください。

注意：現段階は初期版です。Firebase設定値とFirestoreルールを確認してから公開してください。
