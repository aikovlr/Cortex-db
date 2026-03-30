import express from 'express';
import 'dotenv/config';
import { db } from './db.ts';
import { eq } from 'drizzle-orm';
import { usuarioTable } from './db/schema.ts';
import { calculateMd5Hash } from './hash.ts';
import { signAccessToken } from './authMiddleware.ts';

const router = express.Router();

router.post('/login', async (req, res) => {
    const { email, senha } = req.body;

    try {
        const result = await db
            .select()
            .from(usuarioTable)
            .where(eq(usuarioTable.email, email))
            .limit(1);
        const user = result[0];
        
        if (!user) return res.status(401).json({ message: 'Usuário não encontrado.' });

        const senhaHash = calculateMd5Hash(senha);
        const senhaValida = senhaHash === user.senha_hash;
        if (!senhaValida) return res.status(401).json({ message: 'Credenciais inválidas.' });

        const token = signAccessToken(user);
        res.json({ mensagem: 'Login bem-sucedido', token, nome: user.nome });
    } catch (error) {
        res.status(500).json({ message: 'Erro no servidor.' });
    }
});

export default router;