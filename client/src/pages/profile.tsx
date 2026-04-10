import { useState, useRef } from "react";
import { useProfile, useUpdateProfile, useUploadAvatar } from "@/hooks/use-profile";
import { LoadingSpinner } from "@/components/loading";
import { Button } from "@/components/button";
import { Input } from "@/components/input";
import { Camera, User as UserIcon, GraduationCap, BookOpen, Save } from "lucide-react";

const PRESET_AVATARS = [
  { id: "owl", emoji: "🦉", label: "Owl" },
  { id: "rocket", emoji: "🚀", label: "Rocket" },
  { id: "brain", emoji: "🧠", label: "Brain" },
  { id: "star", emoji: "⭐", label: "Star" },
  { id: "lightning", emoji: "⚡", label: "Lightning" },
  { id: "fire", emoji: "🔥", label: "Fire" },
  { id: "gem", emoji: "💎", label: "Gem" },
  { id: "trophy", emoji: "🏆", label: "Trophy" },
  { id: "mountain", emoji: "🏔️", label: "Mountain" },
  { id: "leaf", emoji: "🌿", label: "Leaf" },
  { id: "palette", emoji: "🎨", label: "Palette" },
  { id: "music", emoji: "🎵", label: "Music" },
];

function AvatarDisplay({ url, size = "lg" }: { url?: string | null, size?: "sm" | "lg" }) {
  const dim = size === "lg" ? "w-24 h-24 text-4xl" : "w-10 h-10 text-xl";
  if (!url) {
    return (
      <div className={`${dim} rounded-full bg-primary/10 flex items-center justify-center`}>
        <UserIcon className="w-1/2 h-1/2 text-primary" />
      </div>
    );
  }
  if (url.startsWith("emoji:")) {
    const emoji = url.replace("emoji:", "");
    return (
      <div className={`${dim} rounded-full bg-primary/10 flex items-center justify-center`}>
        <span>{emoji}</span>
      </div>
    );
  }
  return (
    <img src={url} alt="Avatar" className={`${dim} rounded-full object-cover border-2 border-border`} />
  );
}

export default function Profile() {
  const { data: profile, isLoading } = useProfile();
  const updateProfile = useUpdateProfile();
  const uploadAvatar = useUploadAvatar();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    university: "",
    bio: "",
  });
  const [initialized, setInitialized] = useState(false);

  if (isLoading) return <LoadingSpinner />;

  if (profile && !initialized) {
    setForm({
      firstName: profile.firstName || "",
      lastName: profile.lastName || "",
      university: profile.university || "",
      bio: profile.bio || "",
    });
    setInitialized(true);
  }

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfile.mutate(form);
  };

  const handlePresetAvatar = (emoji: string) => {
    updateProfile.mutate({ profileImageUrl: `emoji:${emoji}` });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="bg-primary/5 rounded-3xl p-8 border border-primary/10">
        <h1 className="text-4xl font-display font-bold text-foreground mb-2">Your Profile</h1>
        <p className="text-muted-foreground text-lg">Manage your personal information and avatar.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Avatar Section */}
        <div className="bg-card rounded-2xl border border-border p-6 shadow-sm space-y-6">
          <h2 className="text-xl font-display font-bold">Profile Picture</h2>

          {/* Current Avatar */}
          <div className="flex flex-col items-center gap-4">
            <AvatarDisplay url={profile?.profileImageUrl} size="lg" />
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                isLoading={uploadAvatar.isPending}
                data-testid="button-upload-avatar"
              >
                <Camera className="w-4 h-4 mr-2" />
                Upload Photo
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleFileUpload}
                data-testid="input-avatar-file"
              />
            </div>
          </div>

          {/* Preset Avatars */}
          <div>
            <p className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wider">Choose a Preset</p>
            <div className="grid grid-cols-4 gap-2">
              {PRESET_AVATARS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handlePresetAvatar(preset.emoji)}
                  title={preset.label}
                  className={`
                    w-full aspect-square rounded-xl text-2xl flex items-center justify-center transition-all border-2
                    ${profile?.profileImageUrl === `emoji:${preset.emoji}`
                      ? "border-primary bg-primary/10 scale-105"
                      : "border-border bg-secondary hover:border-primary/50 hover:bg-primary/5"
                    }
                  `}
                  data-testid={`button-preset-${preset.id}`}
                >
                  {preset.emoji}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Info Section */}
        <div className="lg:col-span-2 bg-card rounded-2xl border border-border p-6 shadow-sm">
          <h2 className="text-xl font-display font-bold mb-6">Personal Information</h2>
          <form onSubmit={handleSave} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={form.firstName}
                onChange={e => setForm({ ...form, firstName: e.target.value })}
                data-testid="input-first-name"
              />
              <Input
                label="Last Name"
                value={form.lastName}
                onChange={e => setForm({ ...form, lastName: e.target.value })}
                data-testid="input-last-name"
              />
            </div>

            <div className="relative">
              <GraduationCap className="absolute left-3 top-[38px] w-4 h-4 text-muted-foreground" />
              <Input
                label="University"
                value={form.university}
                onChange={e => setForm({ ...form, university: e.target.value })}
                placeholder="e.g. Stanford University"
                className="pl-9"
                data-testid="input-university"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-foreground mb-1.5">Bio</label>
              <textarea
                value={form.bio}
                onChange={e => setForm({ ...form, bio: e.target.value })}
                placeholder="Tell other students a bit about yourself..."
                rows={4}
                className="w-full rounded-xl border border-border bg-background px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                data-testid="input-bio"
              />
            </div>

            <div className="flex items-center gap-4 pt-2">
              <Button
                type="submit"
                isLoading={updateProfile.isPending}
                data-testid="button-save-profile"
              >
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
              {profile?.email && (
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium">Email:</span> {profile.email}
                </p>
              )}
            </div>
          </form>
        </div>
      </div>

      {/* Stats Card */}
      <div className="bg-card rounded-2xl border border-border p-6 shadow-sm">
        <h2 className="text-xl font-display font-bold mb-4">Account Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-primary/5 rounded-xl p-4 text-center">
            <BookOpen className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">—</p>
            <p className="text-sm text-muted-foreground">Courses</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-4 text-center">
            <GraduationCap className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground truncate text-sm mt-1">{profile?.university || "—"}</p>
            <p className="text-sm text-muted-foreground">University</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-4 text-center">
            <UserIcon className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{profile?.firstName ? `${profile.firstName} ${profile.lastName || ""}`.trim() : "—"}</p>
            <p className="text-sm text-muted-foreground">Name</p>
          </div>
          <div className="bg-primary/5 rounded-xl p-4 text-center">
            <Camera className="w-6 h-6 text-primary mx-auto mb-2" />
            <p className="text-2xl font-bold text-foreground">{profile?.profileImageUrl ? "Set" : "None"}</p>
            <p className="text-sm text-muted-foreground">Avatar</p>
          </div>
        </div>
      </div>
    </div>
  );
}
