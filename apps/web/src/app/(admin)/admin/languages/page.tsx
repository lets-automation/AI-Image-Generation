"use client";

import { useCallback, useEffect, useState } from "react";
import { adminApi } from "@/lib/admin-api";
import toast from "react-hot-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Trash2, Globe, Power, Info } from "lucide-react";

interface LanguageData {
  id: string;
  code: string;
  label: string;
  nativeLabel: string;
  script: string;
  fontFamily: string;
  direction: string;
  isActive: boolean;
  sortOrder: number;
}

export default function AdminLanguagesPage() {
  const [languages, setLanguages] = useState<LanguageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Add form state
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newNativeLabel, setNewNativeLabel] = useState("");
  const [newScript, setNewScript] = useState("Latin");
  const [newFontFamily, setNewFontFamily] = useState("Noto Sans");
  const [newDirection, setNewDirection] = useState("ltr");

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.listLanguages();
      setLanguages(data);
    } catch {
      toast.error("Failed to load languages");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function handleAdd() {
    if (!newCode.trim() || !newLabel.trim() || !newNativeLabel.trim()) {
      toast.error("Code, label, and native label are required");
      return;
    }
    setSaving(true);
    try {
      await adminApi.createLanguage({
        code: newCode.trim(),
        label: newLabel.trim(),
        nativeLabel: newNativeLabel.trim(),
        script: newScript,
        fontFamily: newFontFamily,
        direction: newDirection,
      });
      toast.success(`Language "${newLabel.trim()}" added`);
      setShowAdd(false);
      setNewCode(""); setNewLabel(""); setNewNativeLabel("");
      setNewScript("Latin"); setNewFontFamily("Noto Sans"); setNewDirection("ltr");
      loadData();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(axiosErr?.response?.data?.error?.message ?? "Failed to add language");
    } finally {
      setSaving(false);
    }
  }

  async function handleToggle(lang: LanguageData) {
    try {
      await adminApi.updateLanguage(lang.id, { isActive: !lang.isActive });
      toast.success(lang.isActive ? `${lang.label} deactivated` : `${lang.label} activated`);
      loadData();
    } catch {
      toast.error("Failed to update language");
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteLanguage(deleteTarget);
      toast.success("Language deleted");
      setDeleteTarget(null);
      loadData();
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: { message?: string } } } };
      toast.error(axiosErr?.response?.data?.error?.message ?? "Failed to delete language");
    }
  }

  return (
    <TooltipProvider>
      <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Languages</h2>
          <p className="text-muted-foreground">Manage languages available for content generation</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="mr-2 h-4 w-4" /> Add Language
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {languages.map((lang) => (
            <Card
              key={lang.id}
              className={`transition-opacity ${!lang.isActive ? "opacity-50" : ""}`}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                      <Globe className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-semibold">{lang.label}</p>
                      <p className="text-sm text-muted-foreground">{lang.nativeLabel}</p>
                    </div>
                  </div>
                  <Badge variant={lang.isActive ? "default" : "secondary"} className="text-xs">
                    {lang.code}
                  </Badge>
                </div>
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>Script: {lang.script}</span>
                  <span>•</span>
                  <span>Dir: {lang.direction.toUpperCase()}</span>
                  <span>•</span>
                  <span>Font: {lang.fontFamily}</span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggle(lang)}
                    className="flex-1"
                  >
                    <Power className="mr-1.5 h-3.5 w-3.5" />
                    {lang.isActive ? "Deactivate" : "Activate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeleteTarget(lang.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add Language Dialog */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add New Language</DialogTitle>
            <DialogDescription>
              Add a new language that will be available for content generation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Language Code *</Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value.toUpperCase().replace(/\s+/g, "_"))}
                  placeholder="e.g. MARATHI"
                />
                <p className="text-xs text-muted-foreground">Uppercase, e.g. MARATHI, GUJARATI</p>
              </div>
              <div className="space-y-2">
                <Label>Display Label *</Label>
                <Input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder="e.g. Marathi" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Native Label *</Label>
              <Input value={newNativeLabel} onChange={(e) => setNewNativeLabel(e.target.value)} placeholder="e.g. मराठी" />
              <p className="text-xs text-muted-foreground">Name in the language itself</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Script
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1}>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">
                        The writing system used for this language (e.g., Latin, Devanagari, Arabic). Helps in categorizing and font selection.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input value={newScript} onChange={(e) => setNewScript(e.target.value)} placeholder="Latin" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Font Family
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1}>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">
                        The exact font family name to be used when generating images in this language. This must match a font available in the system (e.g., "Noto Sans", "Noto Sans Devanagari").
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Input value={newFontFamily} onChange={(e) => setNewFontFamily(e.target.value)} placeholder="Noto Sans" />
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5">
                  Direction
                  <Tooltip>
                    <TooltipTrigger type="button" tabIndex={-1}>
                      <Info className="h-3.5 w-3.5 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="max-w-[200px] text-xs">
                        The text reading direction: LTR (Left-to-Right) for most languages, or RTL (Right-to-Left) for Arabic, Hebrew, Urdu, etc.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </Label>
                <Select value={newDirection} onValueChange={setNewDirection}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ltr">LTR</SelectItem>
                    <SelectItem value="rtl">RTL</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button onClick={handleAdd} disabled={saving}>
              {saving ? "Adding..." : "Add Language"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Language</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this language. Languages used in existing generations cannot be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  </TooltipProvider>
);
}
