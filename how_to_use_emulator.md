# エミュレータで実行したいこととコマンドのリスト
既存のフォーマットに沿ってエージェントが追記してよい
コマンドはすべてpowershell用

## スクリーンショットを撮影
出力ファイル名は適宜変更すること
```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" exec-out screencap -p > .\screenshots\screen.png
```
`./screenshots/screen.png`に保存される

## HOMEボタンを押す
```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell input keyevent 3
```

## 戻るボタンを押す
```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell input keyevent 4
```

## 指定座標をタップする
x=100, y=200の場合
```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell input tap 100 200
```

## 画面サイズを取得する
タップ座標を決める前に確認すること
```
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" shell wm size
```
出力例:
```
Physical size: 1080x2400
```
