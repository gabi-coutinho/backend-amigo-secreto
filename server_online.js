const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const nodemailer = require("nodemailer");

const app = express();

app.use(cors());
app.use(express.json());

const db = mysql.createPool({
  host: process.env.MYSQLHOST,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
  port: process.env.MYSQLPORT,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    console.log("Erro ao conectar ao banco:", err);
  } else {
    console.log("Conectado ao banco com sucesso!");
    connection.release();
  }
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

function enviarEmail(destino, nomeAmigo, nomePessoa, nomeGrupo) {
  return transporter.sendMail({
    from: process.env.EMAIL_USER,
    to: destino,
    subject: `Seu amigo secreto - ${nomeGrupo}`,
    text: `Olá ${nomePessoa}! Seu amigo secreto é: ${nomeAmigo}`
  });
}

function sortear(participantes) {
  if (participantes.length < 2) {
    throw new Error("É necessário pelo menos 2 participantes.");
  }

  const embaralhado = [...participantes].sort(() => Math.random() - 0.5);
  const resultado = [];

  for (let i = 0; i < embaralhado.length; i++) {
    const remetente = embaralhado[i];
    const destinatario = embaralhado[(i + 1) % embaralhado.length];

    resultado.push({
      remetente,
      destinatario
    });
  }

  return resultado;
}

app.get("/", (req, res) => {
  res.json({ mensagem: "API do Amigo Secreto está funcionando!" });
});

app.post("/participantes", (req, res) => {
  const { nome, email, grupo_id } = req.body;

  if (!nome || !email || !grupo_id) {
    return res.status(400).json({
      mensagem: "Nome, email e grupo_id são obrigatórios."
    });
  }

  db.query(
    "INSERT INTO participantes (nome, email, grupo_id) VALUES (?, ?, ?)",
    [nome, email, grupo_id],
    (err, result) => {
      if (err) {
        console.log("Erro ao cadastrar participante:", err);

        if (err.code === "ER_DUP_ENTRY") {
          return res.status(400).json({
            mensagem: "Este e-mail já está cadastrado neste grupo."
          });
        }

        return res.status(500).json({
          mensagem: "Erro ao cadastrar participante."
        });
      }

      return res.status(201).json({
        mensagem: "Participante cadastrado com sucesso!",
        id: result.insertId
      });
    }
  );
});

app.get("/participantes/grupo/:grupoId", (req, res) => {
  const grupoId = req.params.grupoId;

  db.query(
    "SELECT * FROM participantes WHERE grupo_id = ? ORDER BY nome ASC",
    [grupoId],
    (err, resultados) => {
      if (err) {
        console.log("Erro ao buscar participantes:", err);
        return res.status(500).json({
          mensagem: "Erro ao buscar participantes."
        });
      }

      return res.json(resultados);
    }
  );
});

app.post("/sortear/:grupoId", (req, res) => {
  const grupoId = req.params.grupoId;

  db.query(
    "SELECT * FROM participantes WHERE grupo_id = ?",
    [grupoId],
    (err, participantes) => {
      if (err) {
        console.log("Erro ao buscar participantes:", err);
        return res.status(500).json({
          mensagem: "Erro ao buscar participantes."
        });
      }

      if (participantes.length < 2) {
        return res.status(400).json({
          mensagem: "O grupo precisa ter pelo menos 2 participantes."
        });
      }

      let resultado;

      try {
        resultado = sortear(participantes);
      } catch (erroSorteio) {
        console.log("Erro no sorteio:", erroSorteio);
        return res.status(500).json({
          mensagem: "Erro ao realizar sorteio."
        });
      }

      const valores = resultado.map((par) => [
        grupoId,
        par.remetente.id,
        par.remetente.nome,
        par.remetente.email,
        par.destinatario.id,
        par.destinatario.nome,
        par.destinatario.email
      ]);

      db.query(
        `INSERT INTO sorteios
        (grupo_id, remetente_id, remetente_nome, remetente_email, destinatario_id, destinatario_nome, destinatario_email)
        VALUES ?`,
        [valores],
        (errInsert) => {
          if (errInsert) {
            console.log("Erro ao salvar sorteio:", errInsert);
            return res.status(500).json({
              mensagem: "Erro ao salvar sorteio no banco."
            });
          }

         
res.json({
  mensagem: "Sorteio realizado com sucesso!"
});


Promise.all(
  resultado.map((par) =>
    enviarEmail(
      par.remetente.email,
      par.destinatario.nome,
      par.remetente.nome,
      `Grupo ${grupoId}`
    )
  )
)
  .then(() => {
    console.log("E-mails enviados!");
  })
  .catch((err) => {
    console.log("Erro ao enviar e-mails:", err);
  });
            .catch((errEmail) => {
              console.log("Erro ao enviar e-mails:", errEmail);
              return res.status(500).json({
                mensagem: "Sorteio salvo, mas houve erro ao enviar e-mails."
              });
            });
        }
      );
    }
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});