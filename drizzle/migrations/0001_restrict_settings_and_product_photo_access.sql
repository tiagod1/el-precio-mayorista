DROP POLICY IF EXISTS "public read settings" ON public.settings;
CREATE POLICY "admin read settings" ON public.settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE OR REPLACE FUNCTION public.get_catalog_settings()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT jsonb_build_object('whatsapp', s.whatsapp, 'ocultar_sin_stock', s.ocultar_sin_stock, 'ultima_actualizacion', s.ultima_actualizacion) FROM public.settings s WHERE s.id = 1; $$;
REVOKE ALL ON FUNCTION public.get_catalog_settings() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_catalog_settings() TO anon, authenticated, service_role;
DROP POLICY IF EXISTS "public read photos" ON storage.objects;
CREATE POLICY "admin read photos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'product-photos' AND public.has_role(auth.uid(), 'admin'::public.app_role));