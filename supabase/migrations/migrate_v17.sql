-- Home Plus — Migration v17
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor).
-- Safe to run multiple times (idempotent).
--
-- HOTFIX — PIN RPCs could not resolve gen_salt()/crypt().
--
-- v13 created set_member_pin / verify_member_pin with `set search_path = public`.
-- On Supabase, pgcrypto is installed in the `extensions` schema, not public, so
-- gen_salt()/crypt() were not on the function's search_path and any attempt to
-- set a PIN failed with: "function gen_salt(unknown) does not exist".
--
-- Fix: ensure pgcrypto exists in `extensions` and add `extensions` to the
-- search_path of both functions. (search_path is a function-level setting, so
-- ALTER FUNCTION ... SET search_path is enough — no need to recreate the bodies.)

create extension if not exists pgcrypto with schema extensions;

alter function public.set_member_pin(uuid, text)   set search_path = public, extensions;
alter function public.verify_member_pin(uuid, text) set search_path = public, extensions;

notify pgrst, 'reload schema';
