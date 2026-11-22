// A tiny in-page signal bus between the storage layer, the sync engine and the
// React store. It has no imports so any module can use it without cycles.
export type Realm = "progress" | "library" | "profile";
type Listener = (realm: Realm) => void;

const local = new Set<Listener>();   // this device changed something: sync should run
const applied = new Set<Listener>(); // sync changed local data: screens should reload

const emit = (set: Set<Listener>, realm: Realm) => { for (const l of [...set]) { try { l(realm); } catch { /* a listener must not break a save */ } } };
const on = (set: Set<Listener>, l: Listener) => { set.add(l); return () => { set.delete(l); }; };

export const notifyLocalWrite = (realm: Realm) => emit(local, realm);
export const onLocalWrite = (l: Listener) => on(local, l);
export const notifyCloudApplied = (realm: Realm) => emit(applied, realm);
export const onCloudApplied = (l: Listener) => on(applied, l);
