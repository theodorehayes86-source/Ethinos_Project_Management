import React, { useEffect, useState } from 'react';
import { User, Lock, LogOut } from 'lucide-react';

const ProfileDropdown = ({
  isProfileOpen,
  setIsProfileOpen,
  setIsNotifOpen,
  currentUser,
  onUpdateProfileName,
  onChangePassword,
  onLogout
}) => {
  const [activeMenu, setActiveMenu] = useState('profile');
  const [nameInput, setNameInput] = useState(currentUser?.name || '');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [successNote, setSuccessNote] = useState('');

  useEffect(() => {
    setNameInput(currentUser?.name || '');
  }, [currentUser?.name]);

  const handleSaveName = (event) => {
    event.preventDefault();
    if (!nameInput.trim()) return;
    onUpdateProfileName(nameInput.trim());
    setSuccessNote('Name updated');
    setTimeout(() => setSuccessNote(''), 1400);
  };

  const handleSavePassword = (event) => {
    event.preventDefault();
    if (!newPassword || !confirmPassword) {
      setPasswordError('Enter both password fields');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('Passwords do not match');
      return;
    }

    onChangePassword(newPassword);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordError('');
    setSuccessNote('Password updated');
    setTimeout(() => setSuccessNote(''), 1400);
  };

  const menuButtonClass = (isActive) =>
    `w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all ${isActive ? 'text-slate-900 border border-indigo-200/70 bg-white/80' : 'text-slate-900 hover:bg-white/70 border border-transparent bg-white/55'}`;

  return (
    <div className="relative">
      <button 
        onClick={() => { setIsProfileOpen(!isProfileOpen); setIsNotifOpen(false); }} 
        className="flex items-center gap-3 px-3 py-1.5 rounded-full border border-white/80 bg-white/70 hover:border-indigo-200/70 transition-all backdrop-blur-sm"
      >
        <span className="text-[10px] lowercase italic font-bold text-slate-600">{currentUser.name}</span>
      </button>

      {isProfileOpen && (
        <div
          className="absolute right-0 mt-3 w-80 border border-white/80 rounded-2xl shadow-xl z-[300] overflow-hidden text-left font-sans backdrop-blur-md"
          style={{
            background:
              'radial-gradient(56% 50% at 8% 10%, rgba(241, 94, 88, 0.14) 0%, rgba(241, 94, 88, 0) 64%), radial-gradient(42% 46% at 55% 92%, rgba(82, 110, 255, 0.12) 0%, rgba(82, 110, 255, 0) 66%), radial-gradient(32% 36% at 96% 10%, rgba(236, 232, 123, 0.16) 0%, rgba(236, 232, 123, 0) 62%), rgba(255,255,255,0.92)'
          }}
        >
          <div className="p-3 border-b border-white/70 bg-white/45">
            <p className="text-sm font-semibold text-slate-800">{currentUser?.name}</p>
            <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
          </div>

          <div className="p-3 space-y-2">
            <div className="grid grid-cols-3 gap-1">
              <button type="button" className={menuButtonClass(activeMenu === 'profile')} onClick={() => setActiveMenu('profile')}>
                <User size={14} /> Profile
              </button>
              <button type="button" className={menuButtonClass(activeMenu === 'password')} onClick={() => setActiveMenu('password')}>
                <Lock size={14} /> Password
              </button>
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition-all bg-white/75 border border-white/80 text-red-600 hover:bg-red-50"
                onClick={() => onLogout?.()}
              >
                <LogOut size={14} /> Logout
              </button>
            </div>

            {activeMenu === 'profile' && (
              <form onSubmit={handleSaveName} className="space-y-2 p-2 bg-white/70 rounded-lg border border-white/80 backdrop-blur-sm">
                <label className="text-[11px] font-semibold text-slate-900">Display Name</label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500"
                />
                <div className="flex justify-end">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-semibold hover:bg-slate-100 transition-all">Save</button>
                </div>
              </form>
            )}

            {activeMenu === 'password' && (
              <form onSubmit={handleSavePassword} className="space-y-2 p-2 bg-white/70 rounded-lg border border-white/80 backdrop-blur-sm">
                <label className="text-[11px] font-semibold text-slate-900">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => {
                    setNewPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500"
                />
                <label className="text-[11px] font-semibold text-slate-900">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => {
                    setConfirmPassword(e.target.value);
                    if (passwordError) setPasswordError('');
                  }}
                  className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-500"
                />
                {passwordError && <p className="text-[11px] font-semibold text-red-600">{passwordError}</p>}
                <div className="flex justify-end">
                  <button type="submit" className="px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 text-xs font-semibold hover:bg-slate-100 transition-all">Update</button>
                </div>
              </form>
            )}

            {successNote && (
              <p className="text-[11px] font-semibold text-emerald-600 px-1">{successNote}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;