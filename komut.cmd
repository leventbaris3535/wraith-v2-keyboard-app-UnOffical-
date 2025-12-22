curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":1}"

:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":1}" bu default profil
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":2}" bu profil 1
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":3}" bu profil 2
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":4}" bu profil 3
:: curl -X POST http://localhost:3000/control -H "Content-Type: application/json" -d "{\"port\":5}" bu profil 4

:: özel makrolar ile kalvye profili değiştirmek icin eklenmiştir. cmd ile curl -X POST ile uygulamanın açtıgı porta 1 2 3 4 5 die veri gönderirseniz uygulama profili sizin için değişicektir yani fakrlı bir cihazdan post atarakta klavye profili değiştirmek mümkün (local ağ}
