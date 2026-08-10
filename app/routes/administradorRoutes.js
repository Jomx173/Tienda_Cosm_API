const express = require("express");
const router = express.Router();

const administradorController = require("../controllers/administradorController");

router.get("/", administradorController.obtenerAdministradores);
router.get("/:id", administradorController.obtenerAdministrador);
router.post("/", administradorController.crearAdministrador);
router.put("/:id", administradorController.actualizarAdministrador);
router.delete("/:id", administradorController.eliminarAdministrador);

module.exports = router;