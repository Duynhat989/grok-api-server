const path = require('path')
const http = require('http')
const express = require('express')
const fs = require('fs');
const dotenv = require("dotenv");
const bodyParser = require('body-parser')
const cors = require('cors')

dotenv.config();

// Khai báo app
const app = express();
const server = http.createServer(app);
// Mở công giao tiếp công khai
app.use(express.static(path.join(__dirname, 'public')));
// Mở công giao tiếp công khai
app.use(express.static(path.join(__dirname, 'media')));

// Đường dẫn thư mục storages
const storagePath = path.join(__dirname, 'storages');
// Kiểm tra và tạo nếu chưa tồn tại
if (!fs.existsSync(storagePath)) {
  fs.mkdirSync(storagePath, { recursive: true });
}

// static
app.use("/storages", express.static(storagePath));

app.use("/storages", (req, res) => {
  res.status(404).send("File not found in storages.");
});

app.use(cors({
  origin: '*', // Cho phép tất cả domain
}))
app.use(bodyParser.json({ limit: '200mb' }));
app.use(bodyParser.urlencoded({ limit: '200mb', extended: true }));

// Khai báo middlewareler có thể dùng

const {
    grokRoutes,
    managerRoutes
} = require('./src/routes');

app.use('/api/grok', grokRoutes);
app.use('/api/manager', managerRoutes);

const PORT = 2053;
server.listen(PORT, () => console.log(`Listen: ${PORT}`));

