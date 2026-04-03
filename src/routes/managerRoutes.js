const express = require("express");
const router = express.Router();

const managerController = require("../controllers/managerController.js");


// ================== ACCOUNT (dataGrok) ==================

// lấy toàn bộ account
router.get("/accounts", (req, res) => {
    res.json(managerController.getAllAccounts());
});

// thêm account
router.post("/accounts", (req, res) => {
    const acc = managerController.addAccount(req.body);
    res.json(acc);
});

// sửa account
router.put("/accounts/:id", (req, res) => {
    const acc = managerController.updateAccount(req.params.id, req.body);
    if (!acc) return res.status(404).json({ error: "Not found" });
    res.json(acc);
});

// xóa account
router.delete("/accounts/:id", (req, res) => {
    const ok = managerController.deleteAccount(req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    res.json({ success: true });
});

// bật/tắt hoạt động
router.patch("/accounts/:id/active", (req, res) => {
    const acc = managerController.toggleActive(req.params.id);
    if (!acc) return res.status(404).json({ error: "Not found" });
    res.json(acc);
});

// set live / die
router.patch("/accounts/:id/status", (req, res) => {
    const acc = managerController.setStatus(req.params.id, req.body.status);
    if (!acc) return res.status(404).json({ error: "Not found" });
    res.json(acc);
});

module.exports = router;