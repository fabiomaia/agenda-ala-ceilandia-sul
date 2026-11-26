-- Rode DEPOIS de criar sua conta no site (troque o e-mail pelo seu).
insert into public.admins (user_id, dono)
select id, true from auth.users where email = 'SEU-EMAIL@gmail.com'
on conflict (user_id) do update set dono = true;

-- Conferência: deve aparecer uma linha com dono = true
select a.user_id, u.email, a.dono from public.admins a join auth.users u on u.id = a.user_id;
