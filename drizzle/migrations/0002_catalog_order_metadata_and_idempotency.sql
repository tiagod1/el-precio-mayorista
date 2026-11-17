ALTER TABLE public.orders ADD COLUMN customer_number text, ADD COLUMN delivery_address text, ADD COLUMN request_key uuid UNIQUE, ADD COLUMN request_fingerprint text;
ALTER TABLE public.settings ADD COLUMN mp_enabled boolean NOT NULL DEFAULT false, ADD COLUMN mp_percent numeric NOT NULL DEFAULT 0, ADD COLUMN mp_minimum numeric NOT NULL DEFAULT 0, ADD COLUMN mp_cap numeric NOT NULL DEFAULT 0, ADD COLUMN mp_days integer[] NOT NULL DEFAULT '{}';
CREATE OR REPLACE FUNCTION public.get_catalog_settings() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$ SELECT jsonb_build_object('whatsapp',s.whatsapp,'ocultar_sin_stock',s.ocultar_sin_stock,'ultima_actualizacion',s.ultima_actualizacion,'mp_enabled',s.mp_enabled,'mp_percent',s.mp_percent,'mp_minimum',s.mp_minimum,'mp_cap',s.mp_cap,'mp_days',s.mp_days) FROM public.settings s WHERE s.id=1; $$;
CREATE OR REPLACE FUNCTION public.create_catalog_order(p_customer_number text,p_name text,p_phone text,p_address text,p_items jsonb,p_request_key uuid,p_token text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_hash text; v_existing public.orders%ROWTYPE; v_result jsonb; v_id uuid;
BEGIN
 IF p_request_key IS NULL OR char_length(trim(coalesce(p_customer_number,''))) NOT BETWEEN 1 AND 50 OR char_length(trim(coalesce(p_address,''))) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Completá número de cliente y dirección de entrega'; END IF;
 v_hash := md5(jsonb_build_object('number',trim(p_customer_number),'name',trim(p_name),'phone',regexp_replace(p_phone,'\D','','g'),'address',trim(p_address),'items',p_items)::text);
 PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key::text,0));
 SELECT * INTO v_existing FROM public.orders WHERE request_key=p_request_key;
 IF FOUND THEN
  IF v_existing.request_fingerprint IS DISTINCT FROM v_hash THEN RAISE EXCEPTION 'El intento corresponde a otro pedido'; END IF;
  RETURN jsonb_build_object('order_id',v_existing.id,'access_token',v_existing.access_token,'total',v_existing.total);
 END IF;
 v_result := public.create_customer_order(p_name,p_phone,p_items,p_token);
 v_id := (v_result->>'order_id')::uuid;
 UPDATE public.orders SET customer_number=trim(p_customer_number),delivery_address=trim(p_address),request_key=p_request_key,request_fingerprint=v_hash WHERE id=v_id;
 RETURN v_result || jsonb_build_object('total',(SELECT total FROM public.orders WHERE id=v_id));
END; $$;
REVOKE ALL ON FUNCTION public.create_catalog_order(text,text,text,text,jsonb,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_catalog_order(text,text,text,text,jsonb,uuid,text) TO anon,authenticated,service_role;