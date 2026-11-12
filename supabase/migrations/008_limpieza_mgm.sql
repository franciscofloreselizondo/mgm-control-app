alter table properties add column if not exists cleaning boolean default true;
update properties set cleaning = false where code in ('MD301','MD302','Acervo','LMB1');
