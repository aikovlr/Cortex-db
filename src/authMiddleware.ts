import jwt from 'jsonwebtoken';
import 'dotenv/config';
import type { Request, Response, NextFunction } from 'express';

interface AuthenticatedRequest extends Request {
    user?: { id: number; email: string };
}

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error('JWT_SECRET não definido nas variáveis de ambiente');
}

/** Mesmo payload do login — usado após cadastro para permitir POST /usuarios/anexo (foto de perfil). */
export function signAccessToken(user: { id_usuario: number; email: string; nome: string }): string {
    return jwt.sign(
        { id: user.id_usuario, email: user.email, nome: user.nome },
        jwtSecret as string,
        { expiresIn: '1h' }
    );
}

export function verificarToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) {
        return res.status(401).json({ message: 'Token não fornecido.' });
    }

    try {
    const decoded = jwt.verify(token, jwtSecret as string);

        if (typeof decoded === 'object' && 'id' in decoded && 'email' in decoded) {
            const id = Number((decoded as any).id);
            const email = (decoded as any).email;
            
            if (Number.isNaN(id) || typeof email !== 'string') {
                return res.status(401).json({ message: 'Token inválido.' });
            }
            req.user = { id, email };
            return next();
        } else {
            return res.status(401).json({ message: 'Token inválido.' });
        }
        
    } catch (error) {
        return res.status(401).json({ message: 'Token inválido.' });
    }
}