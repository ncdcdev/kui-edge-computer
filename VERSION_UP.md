## リポジトリバージョンアップ手順

1. 電源が入っている場合は電源を切る
2. LANケーブルを接続する
3. シリアルケーブルを接続する
4. PCからシリアル通信を開始
  - ボーレート: 115200
  - データ長: 8bit
  - ストップビット: 1bit
  - パリティ: none
  - フロー制御: none
5. シリアル通信経由でArmadilloにrootでログイン
6. 以下のコマンドを実行
`curl https://setup.tpilerecorder.jp/v1/install.sh | bash -s -- -b`
7. 電源が切れたら完了
