import React, { useEffect, useRef, useState } from 'react';
import { User, Lock, LogOut, Camera, Mail, Phone, Check, Eye, EyeOff, Briefcase } from 'lucide-react';

const getInitials = (name) => {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

const AvatarCircle = ({ name, photoURL, size = 'md' }) => {
  const colors = ['bg-indigo-500', 'bg-violet-500', 'bg-pink-500', 'bg-emerald-500', 'bg-amber-500', 'bg-blue-500'];
  const colorIndex = (name || '').charCodeAt(0) % colors.length;
  const sizeClass = size === 'lg' ? 'w-16 h-16 text-xl' : size === 'sm' ? 'w-7 h-7 text-[11px]' : 'w-9 h-9 text-sm';
  if (photoURL) {
    return <img src={photoURL} alt={name} className={`${sizeClass} rounded-full object-cover flex-shrink-0 border-2 border-white shadow-sm`} />;
  }
  return (
    <div className={`${sizeClass} ${colors[colorIndex]} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 shadow-sm`}>
      {getInitials(name)}
    </div>
  );
};

const resizeImageToDataURL = (file, size = 160, quality = 0.80) =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });

const ProfileDropdown = ({
  isProfileOpen,
  setIsProfileOpen,
  setIsNotifOpen,
  currentUser,
  onUpdateProfile,
  onChangePassword,
  onLogout,
}) => {
  const [activeMenu, setActiveMenu] = useState('profile');
  const [nameInput, setNameInput] = useState('');
  const [secondaryEmail, setSecondaryEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [photoURL, setPhotoURL] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [successNote, setSuccessNote] = useState('');
  const [photoLoading, setPhotoLoading] = useState(false);
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const fileRef = useRef();
  const panelRef = useRef();

  useEffect(() => {
    setNameInput(currentUser?.name || '');
    setSecondaryEmail(currentUser?.secondaryEmail || '');
    setPhone(currentUser?.phone || '');
    setPhotoURL(currentUser?.photoURL || '');
  }, [currentUser?.name, currentUser?.secondaryEmail, currentUser?.phone, currentUser?.photoURL]);

  useEffect(() => {
    if (!isProfileOpen) return;
    const handler = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isProfileOpen, setIsProfileOpen]);

  const showSuccess = (msg) => { setSuccessNote(msg); setTimeout(() => setSuccessNote(''), 1800); };

  const handleSaveProfile = (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    onUpdateProfile?.({ name: nameInput.trim(), secondaryEmail: secondaryEmail.trim(), phone: phone.trim(), photoURL });
    showSuccess('Profile saved');
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setPhotoLoading(true);
    const dataURL = await resizeImageToDataURL(file);
    setPhotoURL(dataURL);
    setPhotoLoading(false);
    onUpdateProfile?.({
      name: nameInput.trim() || currentUser?.name || '',
      secondaryEmail: secondaryEmail.trim(),
      phone: phone.trim(),
      photoURL: dataURL,
    });
    showSuccess('Photo updated');
  };

  const handleSavePassword = async (e) => {
    e.preventDefault();
    setPasswordError('');
    if (!currentPassword) { setPasswordError('Enter your current password'); return; }
    if (!newPassword || !confirmPassword) { setPasswordError('Enter both new password fields'); return; }
    if (newPassword.length < 6) { setPasswordError('New password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setPasswordError('New passwords do not match'); return; }
    if (currentPassword === newPassword) { setPasswordError('New password must be different from current'); return; }
    try {
      await onChangePassword?.(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordError('');
      setShowCurrentPwd(false);
      setShowNewPwd(false);
      setShowConfirmPwd(false);
      showSuccess('Password updated');
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
        setPasswordError('Current password is incorrect.');
      } else if (code === 'auth/too-many-requests') {
        setPasswordError('Too many attempts. Please try again later.');
      } else {
        setPasswordError(err?.message || 'Failed to update password. Try again.');
      }
    }
  };

  const tabClass = (id) =>
    `flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-all ${
      activeMenu === id
        ? 'bg-white border border-indigo-200/70 text-slate-900 shadow-sm'
        : 'text-slate-600 hover:text-slate-900 hover:bg-white/70 border border-transparent'
    }`;

  const pwdToggleClass = "absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors";

  const displayName = currentUser?.name || '';

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => { setIsProfileOpen(!isProfileOpen); setIsNotifOpen(false); }}
        className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-full border border-white/80 bg-white/70 hover:border-indigo-200/70 transition-all backdrop-blur-sm"
      >
        <AvatarCircle name={displayName} photoURL={currentUser?.photoURL} size="sm" />
        <span className="text-[11px] font-semibold text-slate-700 max-w-[120px] truncate normal-case not-italic">
          {displayName || currentUser?.email?.split('@')[0] || 'Profile'}
        </span>
      </button>

      {isProfileOpen && (
        <div
          className="absolute right-0 mt-3 w-88 border border-white/80 rounded-2xl shadow-2xl z-[300] overflow-hidden text-left font-sans backdrop-blur-md"
          style={{
            width: '22rem',
            background:
              'radial-gradient(56% 50% at 8% 10%, rgba(241, 94, 88, 0.12) 0%, transparent 64%), radial-gradient(42% 46% at 55% 92%, rgba(82, 110, 255, 0.10) 0%, transparent 66%), rgba(255,255,255,0.94)',
          }}
        >
          <div className="px-4 pt-4 pb-3 border-b border-white/70 bg-white/40">
            <p className="text-xs text-slate-500 truncate">{currentUser?.email}</p>
            <p className="text-[10px] font-semibold text-indigo-500 mt-0.5">{currentUser?.role} · {currentUser?.department || '—'}</p>
          </div>

          <div className="p-3 space-y-3">
            <div className="flex gap-1">
              <button type="button" className={tabClass('profile')} onClick={() => setActiveMenu('profile')}>
                <User size={12} /> Profile
              </button>
              <button type="button" className={tabClass('password')} onClick={() => setActiveMenu('password')}>
                <Lock size={12} /> Password
              </button>
              <button
                type="button"
                className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-semibold rounded-lg bg-white/75 border border-white/80 text-red-600 hover:bg-red-50 transition-all"
                onClick={() => onLogout?.()}
              >
                <LogOut size={12} /> Logout
              </button>
            </div>

            {activeMenu === 'profile' && (
              <form onSubmit={handleSaveProfile} className="space-y-2.5 p-3 bg-white/70 rounded-xl border border-white/80">
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <User size={10} /> Display Name
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-shrink-0">
                      <AvatarCircle name={nameInput || displayName} photoURL={photoURL} size="sm" />
                      <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow hover:bg-indigo-700 transition-all"
                        title="Upload photo"
                      >
                        {photoLoading ? <span className="w-2 h-2 border border-white/50 border-t-white rounded-full animate-spin" /> : <Camera size={8} />}
                      </button>
                    </div>
                    <input
                      type="text"
                      value={nameInput}
                      onChange={(e) => setNameInput(e.target.value)}
                      placeholder="Your full name"
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
                    />
                  </div>
                </div>
                {currentUser?.position && (
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Briefcase size={10} /> Position
                    </label>
                    <div className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-500">
                      {currentUser.position}
                    </div>
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Mail size={10} /> Secondary Email
                  </label>
                  <input
                    type="email"
                    value={secondaryEmail}
                    onChange={(e) => setSecondaryEmail(e.target.value)}
                    placeholder="Personal or backup email"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Phone size={10} /> Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
                  />
                </div>
                <div className="flex justify-end">
                  <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-all">
                    <Check size={11} /> Save Changes
                  </button>
                </div>
              </form>
            )}

            {activeMenu === 'password' && (
              <form onSubmit={handleSavePassword} className="space-y-2.5 p-3 bg-white/70 rounded-xl border border-white/80">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Current Password</label>
                  <div className="relative">
                    <input
                      type={showCurrentPwd ? 'text' : 'password'}
                      value={currentPassword}
                      onChange={(e) => { setCurrentPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                      placeholder="Enter current password"
                      className="w-full bg-white border border-slate-200 rounded-lg px-3 pr-9 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowCurrentPwd(v => !v)} className={pwdToggleClass}>
                      {showCurrentPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-2.5 space-y-2.5">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">New Password</label>
                    <div className="relative">
                      <input
                        type={showNewPwd ? 'text' : 'password'}
                        value={newPassword}
                        onChange={(e) => { setNewPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                        placeholder="Min. 6 characters"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 pr-9 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowNewPwd(v => !v)} className={pwdToggleClass}>
                        {showNewPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Confirm New Password</label>
                    <div className="relative">
                      <input
                        type={showConfirmPwd ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); if (passwordError) setPasswordError(''); }}
                        placeholder="Re-enter new password"
                        className="w-full bg-white border border-slate-200 rounded-lg px-3 pr-9 py-2 text-xs font-medium text-slate-900 outline-none focus:border-indigo-400 transition-all"
                        autoComplete="new-password"
                      />
                      <button type="button" onClick={() => setShowConfirmPwd(v => !v)} className={pwdToggleClass}>
                        {showConfirmPwd ? <EyeOff size={13} /> : <Eye size={13} />}
                      </button>
                    </div>
                  </div>
                </div>
                {passwordError && <p className="text-[11px] font-semibold text-red-500">{passwordError}</p>}
                <div className="flex justify-end">
                  <button type="submit" className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 transition-all">
                    <Check size={11} /> Update Password
                  </button>
                </div>
              </form>
            )}

            {successNote && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg">
                <Check size={11} className="text-emerald-600" />
                <p className="text-[11px] font-semibold text-emerald-700">{successNote}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileDropdown;
