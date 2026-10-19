-- Garante que a view aplique as permissões e políticas RLS de quem consulta.
alter view public.source_status set (security_invoker = true);
