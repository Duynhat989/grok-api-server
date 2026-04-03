const express = require("express");
const router = express.Router();
const grokController = require("../controllers/grokController.js");


router.post("/videos/generate", grokController.generateVideo);

router.post("/images/generate", grokController.generateImage);

router.get("/get-task", grokController.getTask);



module.exports = router;
