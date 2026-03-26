-- Fix v_armario to only show active rentals
-- The DROP VIEW is needed because PostgreSQL doesn't allow changing the set of columns with CREATE OR REPLACE.
DROP VIEW IF EXISTS v_armario CASCADE;

CREATE VIEW v_armario AS
SELECT 
    a.id_armario,
    a.cd_armario,
    a.id_local,
    al.nm_valor as nm_local,
    at.nm_valor as nm_tamanho,
    ap.nm_valor as nm_posicao,
    a.id_status,
    s.nm_status as dc_status,
    l.id_usuario,
    l.dt_termino,
    l.id_tipo,
    l.id_status as status_locacao,
    CASE 
        WHEN a.id_status = 5 THEN 'Reservado'
        WHEN a.id_status = 2 THEN 'Vistoria'
        WHEN a.id_status = 3 THEN 'Manutenção'
        -- The fix: ONLY show as Ocupado if the rental is ACTIVE (status 1)
        WHEN l.id_usuario IS NOT NULL AND l.id_status = 1 THEN 'Ocupado'
        ELSE 'Disponível'
    END as situacao
FROM t_armario a
LEFT JOIN t_armario_status s ON a.id_status = s.id_status
LEFT JOIN t_armario_atributo_valor al ON a.id_local = al.id_valor AND al.id_atributo = 4
LEFT JOIN t_armario_atributo_valor at ON a.id_tamanho = at.id_valor AND at.id_atributo = 3
LEFT JOIN t_armario_atributo_valor ap ON a.id_posicao = ap.id_valor AND ap.id_atributo = 2
-- Link to the most recent ACTIVE rental ONLY
LEFT JOIN LATERAL (
    SELECT id_usuario, dt_termino, id_tipo, id_status
    FROM t_locacao 
    WHERE id_armario = a.id_armario 
    AND id_status = 1 
    ORDER BY id_locacao DESC 
    LIMIT 1
) l ON true;
