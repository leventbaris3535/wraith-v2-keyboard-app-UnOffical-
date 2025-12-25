curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":1}"

::TR

:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":1}" bu default profil
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":2}" bu profil 1
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":3}" bu profil 2
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":4}" bu profil 3
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":5}" bu profil 4

:: Özel makrolar kullanılarak klavye profilini değiştirebilmek için eklenmiştir.
:: Komut satırından (cmd) curl -X POST komutu ile uygulamanın açtığı porta
:: 1, 2, 3, 4 veya 5 değerlerinden biri gönderildiğinde,
:: uygulama aktif klavye profilini otomatik olarak değiştirecektir.
:: Bu sayede aynı yerel ağ üzerindeki başka bir cihazdan POST isteği göndererek
:: klavye profilini değiştirmek mümkündür.

::EN

:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":1}" this is the default profile
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":2}" this is profile 1
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":3}" this is profile 2
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":4}" this is profile 3
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":5}" this is profile 4

:: This was added to allow changing keyboard profiles using custom macros.
:: By sending values 1, 2, 3, 4, or 5 to the port opened by the application using a POST request (curl -X POST),
:: the application will automatically switch the active keyboard profile.
:: This also makes it possible to change keyboard profiles by sending a POST request
:: from another device on the same local network.