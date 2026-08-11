const express = require('express');
const router = express.Router();
const { supabase } = require('../lib/supabase');
const { requireMaster } = require('../middleware/master');
const { logger } = require('../lib/logger');

// ── Todas as rotas exigem acesso master ──────────────────────
router.use(requireMaster);

// ── Listar todos os revendedores ─────────────────────────────
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('resellers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Para cada revendedor, conta os clientes
    const enriched = await Promise.all(
      (data || []).map(async (r) => {
        const { count } = await supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', r.user_id);
        return { ...r, client_count: count || 0 };
      })
    );

    res.json({ success: true, data: enriched });
  } catch (err) {
    logger.error({ err }, 'resellers: list error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Criar revendedor ─────────────────────────────────────────
router.post('/', async (req, res) => {
  try {
    const { user_id, name, email, phone, plan, status, notes } = req.body;
    if (!user_id || !name || !email) {
      return res.status(400).json({ success: false, error: 'user_id, name e email são obrigatórios.' });
    }

    const { data, error } = await supabase.from('resellers').insert({
      user_id, name, email, phone, plan: plan || 'basic', status: status || 'active', notes,
    }).select().single();

    if (error) throw error;

    // Audit log
    await supabase.from('reseller_audit_logs').insert({
      reseller_id: data.id,
      action: 'create',
      admin_email: req.masterUser.email,
      details: `Revendedor '${name}' (${email}) criado com plano ${plan || 'basic'}.`,
    });

    logger.info({ admin: req.masterUser.email, reseller: name }, 'reseller created');
    res.status(201).json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'resellers: create error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Atualizar revendedor ─────────────────────────────────────
router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, phone, plan, status, notes } = req.body;

    // Busca dados atuais para audit
    const { data: old } = await supabase.from('resellers').select('*').eq('id', id).single();

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    if (plan !== undefined) updates.plan = plan;
    if (status !== undefined) updates.status = status;
    if (notes !== undefined) updates.notes = notes;
    updates.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('resellers')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    // Audit logs
    const changes = [];
    if (plan && old.plan !== plan) {
      changes.push(`plano: ${old.plan} → ${plan}`);
      await supabase.from('reseller_audit_logs').insert({
        reseller_id: id, action: 'plan_change',
        admin_email: req.masterUser.email,
        details: `Plano alterado de ${old.plan} para ${plan}.`,
      });
    }
    if (status && old.status !== status) {
      changes.push(`status: ${old.status} → ${status}`);
      await supabase.from('reseller_audit_logs').insert({
        reseller_id: id,
        action: status === 'blocked' ? 'block' : status === 'active' ? 'unblock' : 'update',
        admin_email: req.masterUser.email,
        details: `Status alterado de ${old.status} para ${status}.`,
      });
    }
    if (changes.length === 0) {
      await supabase.from('reseller_audit_logs').insert({
        reseller_id: id, action: 'update',
        admin_email: req.masterUser.email,
        details: 'Dados atualizados.',
      });
    }

    logger.info({ admin: req.masterUser.email, reseller: data.name, changes }, 'reseller updated');
    res.json({ success: true, data });
  } catch (err) {
    logger.error({ err }, 'resellers: update error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Excluir revendedor ───────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const { data: existing } = await supabase.from('resellers').select('name,email').eq('id', id).single();

    const { error } = await supabase.from('resellers').delete().eq('id', id);
    if (error) throw error;

    await supabase.from('reseller_audit_logs').insert({
      reseller_id: id, action: 'delete',
      admin_email: req.masterUser.email,
      details: `Revendedor '${existing?.name}' (${existing?.email}) excluído.`,
    });

    logger.info({ admin: req.masterUser.email, deletedId: id }, 'reseller deleted');
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'resellers: delete error');
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Logs de auditoria ────────────────────────────────────────
router.get('/audit-logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const { data, error } = await supabase
      .from('reseller_audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Verificar limite de clientes RPC ─────────────────────────
router.get('/check-limit/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { data, error } = await supabase.rpc('check_reseller_client_limit', { p_user_id: userId });

    if (error) throw error;
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
