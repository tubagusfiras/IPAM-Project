import { createContext, useContext, useState, useEffect } from "react";

// Semua string UI — default English, ID sebagai fallback alternatif
const EN = {
  // Settings
  "settings.title": "Settings",
  "settings.profile": "Profile",
  "settings.userManagement": "User Management",
  "settings.appearance": "Appearance",
  "settings.accountInfo": "Account Information",
  "settings.changePassword": "Change Password",
  "settings.sessionExpiry": "Session expires 8 hours after login",
  "settings.currentPassword": "Current Password",
  "settings.newPassword": "New Password",
  "settings.updatePassword": "Update Password",
  "settings.updating": "Updating…",
  "settings.passwordChanged": "Password changed successfully",
  "settings.fillPasswords": "Fill in old and new password",
  "settings.passwordMinLength": "New password minimum 4 characters",
  "settings.currentPasswordRequired": "Current password required",
  "settings.min4Chars": "Minimum 4 characters",
  "settings.chooseTheme": "Choose light or dark theme",
  "settings.users": "Users",
  "settings.addUser": "+ Add User",
  "settings.deleteUser": "Delete user",
  "settings.cannotUndo": "This action cannot be undone",
  "settings.userDeleted": "User deleted",
  "settings.resetPassword": "Reset Password",
  "settings.setNewPasswordFor": "Set new password for",
  "settings.resetting": "Resetting…",
  "settings.createUser": "Create User",
  "settings.saveChanges": "Save Changes",
  "settings.saving": "Saving…",
  "settings.usernameRequired": "Username, email, and password are required",
  "settings.passwordReset": "Password reset",
  "settings.language": "Language",
  "settings.chooseLanguage": "Choose display language",
  "settings.appearanceOnly": "Appearance",

  // Confirm
  "confirm.delete": "Delete",
  "confirm.cancel": "Cancel",

  // Generic
  "common.cancel": "Cancel",
  "common.edit": "Edit",
  "common.delete": "Delete",
  "common.saving": "Saving…",
  "common.loading": "Loading…",
};

const ID = {
  "settings.title": "Pengaturan",
  "settings.profile": "Profil",
  "settings.userManagement": "Manajemen User",
  "settings.appearance": "Tampilan",
  "settings.accountInfo": "Informasi Akun",
  "settings.changePassword": "Ubah Password",
  "settings.sessionExpiry": "Sesi akan berakhir 8 jam setelah login",
  "settings.currentPassword": "Password Saat Ini",
  "settings.newPassword": "Password Baru",
  "settings.updatePassword": "Perbarui Password",
  "settings.updating": "Menyimpan…",
  "settings.passwordChanged": "Password berhasil diubah",
  "settings.fillPasswords": "Isi password lama dan baru",
  "settings.passwordMinLength": "Password minimal 4 karakter",
  "settings.currentPasswordRequired": "Password saat ini wajib diisi",
  "settings.min4Chars": "Minimal 4 karakter",
  "settings.chooseTheme": "Pilih tampilan terang atau gelap",
  "settings.users": "Pengguna",
  "settings.addUser": "+ Tambah User",
  "settings.deleteUser": "Hapus user",
  "settings.cannotUndo": "Tindakan ini tidak dapat dibatalkan",
  "settings.userDeleted": "User dihapus",
  "settings.resetPassword": "Reset Password",
  "settings.setNewPasswordFor": "Set password baru untuk",
  "settings.resetting": "Mengatur ulang…",
  "settings.createUser": "Buat User",
  "settings.saveChanges": "Simpan Perubahan",
  "settings.saving": "Menyimpan…",
  "settings.usernameRequired": "Username, email, dan password wajib diisi",
  "settings.passwordReset": "Password berhasil di-reset",
  "settings.language": "Bahasa",
  "settings.chooseLanguage": "Pilih bahasa tampilan",
  "settings.appearanceOnly": "Tampilan",

  "confirm.delete": "Hapus",
  "confirm.cancel": "Batal",

  "common.cancel": "Batal",
  "common.edit": "Edit",
  "common.delete": "Hapus",
  "common.saving": "Menyimpan…",
  "common.loading": "Memuat…",
};

const LANG_MAP = { en: EN, id: ID };

const I18nContext = createContext();

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return localStorage.getItem("ipam-lang") || "en"; }
    catch { return "en"; }
  });

  const setLang = (l) => {
    setLangState(l);
    try { localStorage.setItem("ipam-lang", l); } catch {}
  };

  const tMap = LANG_MAP[lang] || EN;
  const t = (key) => tMap[key] || EN[key] || key;

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
