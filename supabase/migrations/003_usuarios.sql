-- Usuarios. Cambia los correos por los reales antes de ejecutar.
insert into app_users(email, name, role) values
  ('maria@CAMBIAR.com', 'María', 'superadmin'),
  ('mike@CAMBIAR.com',  'Mike',  'superadmin'),
  ('sandy@CAMBIAR.com', 'Sandy', 'finanzas')
on conflict (email) do update set name = excluded.name, role = excluded.role;

insert into access_codes(place) values ('Bodega Qalina'), ('Caja fuerte Qalina') on conflict do nothing;
