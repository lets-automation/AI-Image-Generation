"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Search } from "lucide-react";
import { adminApi, type CategoryData, type FieldSchemaData } from "@/lib/admin-api";
import toast from "react-hot-toast";
import { PageHeader, FormDialog, FormField, ConfirmDialog, StatusBadge, ContentTypeBadge, LoadingState } from "@/components/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Plus, MoreHorizontal, Pencil, Trash2, Power,
  ChevronDown, Layers, FolderTree, CornerDownRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const FIELD_TYPES = [
  "TEXT", "TEXTAREA", "IMAGE", "COLOR", "SELECT", "NUMBER", "PHONE", "EMAIL", "URL",
] as const;

/** Flatten categories into a flat list, but find any category (including nested children) */
function findCategoryById(categories: CategoryData[], id: string): CategoryData | undefined {
  for (const cat of categories) {
    if (cat.id === id) return cat;
    if (cat.children) {
      const found = findCategoryById(cat.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

/** Get all categories as a flat array (top-level + children) for searching */
function flattenCategories(categories: CategoryData[]): CategoryData[] {
  const result: CategoryData[] = [];
  for (const cat of categories) {
    result.push(cat);
    if (cat.children && cat.children.length > 0) {
      result.push(...flattenCategories(cat.children));
    }
  }
  return result;
}

/** Get only top-level categories (parentId === null) */
function getTopLevelCategories(categories: CategoryData[]): CategoryData[] {
  return categories.filter((c) => !c.parentId);
}

export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [deleteFieldTarget, setDeleteFieldTarget] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  // Category form (create)
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [contentType, setContentType] = useState<"EVENT" | "POSTER">("EVENT");
  const [description, setDescription] = useState("");
  const [parentId, setParentId] = useState<string | null>(null);

  // Category form (edit)
  const [editCatId, setEditCatId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editSlug, setEditSlug] = useState("");
  const [editContentType, setEditContentType] = useState<"EVENT" | "POSTER">("EVENT");
  const [editDescription, setEditDescription] = useState("");
  const [editParentId, setEditParentId] = useState<string | null>(null);

  // Field form
  const [fieldKey, setFieldKey] = useState("");
  const [fieldLabel, setFieldLabel] = useState("");
  const [fieldType, setFieldType] = useState<string>("TEXT");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldHasPosition, setFieldHasPosition] = useState(false);
  const [fieldPlaceholder, setFieldPlaceholder] = useState("");
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldCategoryId, setFieldCategoryId] = useState<string | null>(null);

  // Derived: all categories flattened for lookups
  const allFlat = useMemo(() => flattenCategories(categories), [categories]);
  const topLevel = useMemo(() => getTopLevelCategories(allFlat), [allFlat]);

  const loadCategories = useCallback(async () => {
    try {
      setLoading(true);
      const data = await adminApi.listCategories({ search: searchQuery });
      setCategories(data);
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => loadCategories(), 300);
    return () => clearTimeout(timer);
  }, [loadCategories]);

  // When parentId is selected during create, auto-set contentType
  function handleCreateParentChange(value: string) {
    if (value === "__none__") {
      setParentId(null);
    } else {
      setParentId(value);
      const parent = allFlat.find((c) => c.id === value);
      if (parent) {
        setContentType(parent.contentType as "EVENT" | "POSTER");
      }
    }
  }

  function openCreateForParent(parentCatId: string) {
    resetCreateForm();
    setParentId(parentCatId);
    const parent = allFlat.find((c) => c.id === parentCatId);
    if (parent) {
      setContentType(parent.contentType as "EVENT" | "POSTER");
    }
    setShowCreate(true);
  }

  function resetCreateForm() {
    setName(""); setSlug(""); setDescription("");
    setContentType("EVENT"); setParentId(null);
  }

  async function handleCreateCategory() {
    try {
      await adminApi.createCategory({
        name,
        slug,
        contentType,
        description: description || undefined,
        parentId: parentId || undefined,
      });
      toast.success("Category created");
      setShowCreate(false);
      resetCreateForm();
      loadCategories();
    } catch {
      toast.error("Failed to create category");
    }
  }

  // Edit category
  function startEditCategory(cat: CategoryData) {
    setEditCatId(cat.id);
    setEditName(cat.name);
    setEditSlug(cat.slug);
    setEditContentType(cat.contentType as "EVENT" | "POSTER");
    setEditDescription(cat.description || "");
    setEditParentId(cat.parentId);
    setShowEdit(true);
  }

  function handleEditParentChange(value: string) {
    if (value === "__none__") {
      setEditParentId(null);
    } else {
      setEditParentId(value);
      const parent = allFlat.find((c) => c.id === value);
      if (parent) {
        setEditContentType(parent.contentType as "EVENT" | "POSTER");
      }
    }
  }

  async function handleUpdateCategory() {
    if (!editCatId) return;
    try {
      await adminApi.updateCategory(editCatId, {
        name: editName,
        slug: editSlug,
        contentType: editContentType,
        description: editDescription || undefined,
        parentId: editParentId,
      });
      toast.success("Category updated");
      setShowEdit(false);
      setEditCatId(null);
      loadCategories();
    } catch {
      toast.error("Failed to update category");
    }
  }

  async function handleToggleActive(cat: CategoryData) {
    try {
      await adminApi.updateCategory(cat.id, { isActive: !cat.isActive });
      toast.success(cat.isActive ? "Deactivated" : "Activated");
      loadCategories();
    } catch {
      toast.error("Failed to update");
    }
  }

  async function handleDeleteCategory() {
    if (!deleteTarget) return;
    try {
      await adminApi.deleteCategory(deleteTarget);
      toast.success("Category deleted");
      if (expandedId === deleteTarget) setExpandedId(null);
      setDeleteTarget(null);
      loadCategories();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      toast.error(msg || "Cannot delete -- may have sub-categories or templates attached");
    }
  }

  function resetFieldForm() {
    setFieldKey(""); setFieldLabel(""); setFieldType("TEXT");
    setFieldRequired(false); setFieldHasPosition(false);
    setFieldPlaceholder(""); setEditingFieldId(null);
    setFieldCategoryId(null); setShowFieldForm(false);
  }

  function startAddField(catId: string) {
    resetFieldForm();
    setFieldCategoryId(catId);
    setShowFieldForm(true);
  }

  function startEditField(catId: string, field: FieldSchemaData) {
    setFieldCategoryId(catId);
    setEditingFieldId(field.id);
    setFieldKey(field.fieldKey);
    setFieldLabel(field.label);
    setFieldType(field.fieldType);
    setFieldRequired(field.isRequired);
    setFieldHasPosition(field.hasPosition);
    setFieldPlaceholder(field.placeholder || "");
    setShowFieldForm(true);
  }

  async function handleSaveField() {
    if (!fieldCategoryId) return;
    const targetCat = findCategoryById(categories, fieldCategoryId);
    const body = {
      fieldKey, label: fieldLabel, fieldType,
      isRequired: fieldRequired, hasPosition: fieldHasPosition,
      placeholder: fieldPlaceholder || undefined,
      sortOrder: editingFieldId ? undefined : (targetCat?.fieldSchemas.length ?? 0),
    };
    try {
      if (editingFieldId) {
        await adminApi.updateField(fieldCategoryId, editingFieldId, body);
        toast.success("Field updated");
      } else {
        await adminApi.addField(fieldCategoryId, body);
        toast.success("Field added");
      }
      resetFieldForm();
      loadCategories();
    } catch {
      toast.error("Failed to save field");
    }
  }

  async function handleDeleteField() {
    if (!deleteFieldTarget) return;
    const cat = allFlat.find(c => c.fieldSchemas.some(f => f.id === deleteFieldTarget));
    if (!cat) return;
    try {
      await adminApi.deleteField(cat.id, deleteFieldTarget);
      toast.success("Field deleted");
      setDeleteFieldTarget(null);
      loadCategories();
    } catch {
      toast.error("Failed to delete field");
    }
  }

  // Build hierarchical tree: top-level first, children nested
  const filtered = useMemo(() => {
    const all = allFlat.filter(
      (c) => filterType === "ALL" || c.contentType === filterType
    );
    // Get top-level from filtered
    const topFiltered = all.filter((c) => !c.parentId);
    // For each top-level, attach filtered children
    return topFiltered.map((parent) => ({
      ...parent,
      children: all.filter((c) => c.parentId === parent.id),
    }));
  }, [allFlat, filterType]);

  // Possible parents for edit form: exclude self and own children
  function getEditParentOptions(): CategoryData[] {
    if (!editCatId) return topLevel;
    const editCat = findCategoryById(categories, editCatId);
    const childIds = new Set(editCat?.children?.map((c) => c.id) || []);
    return topLevel.filter((c) => c.id !== editCatId && !childIds.has(c.id));
  }

  // --- Render a single category card ---
  function renderCategoryCard(cat: CategoryData, isChild: boolean = false) {
    const templateCount = cat._count?.templates ?? 0;
    const childCount = cat._count?.children ?? cat.children?.length ?? 0;

    return (
      <Collapsible
        key={cat.id}
        open={expandedId === cat.id}
        onOpenChange={(open) => setExpandedId(open ? cat.id : null)}
      >
        <Card className={cn("transition-opacity", !cat.isActive && "opacity-60", isChild && "border-l-4 border-l-primary/30")}>
          <CardHeader className="p-0">
            <div className="flex items-center gap-4 px-5 py-4">
              <CollapsibleTrigger asChild>
                <button className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md transition-colors hover:bg-muted">
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 text-muted-foreground transition-transform duration-200",
                      expandedId === cat.id && "rotate-180"
                    )}
                  />
                </button>
              </CollapsibleTrigger>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5 flex-wrap">
                  <span className="text-sm font-semibold">{cat.name}</span>
                  <ContentTypeBadge type={cat.contentType as "EVENT" | "POSTER"} />
                  <StatusBadge active={cat.isActive} />
                  {templateCount > 0 && (
                    <Badge variant="secondary" className="text-[10px]">
                      {templateCount} template{templateCount !== 1 ? "s" : ""}
                    </Badge>
                  )}
                  {!isChild && childCount > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      <FolderTree className="mr-1 h-3 w-3" />
                      {childCount} sub-categor{childCount !== 1 ? "ies" : "y"}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {cat.slug} &middot; {cat.fieldSchemas.length} field{cat.fieldSchemas.length !== 1 ? "s" : ""}
                  {isChild && cat.parent && (
                    <span className="ml-1">
                      &middot; Sub-category of: <span className="font-medium text-foreground/70">{cat.parent.name}</span>
                    </span>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!isChild && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={(e) => { e.stopPropagation(); openCreateForParent(cat.id); }}
                  >
                    <Plus className="mr-1 h-3 w-3" /> Sub-category
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={(e) => { e.stopPropagation(); startAddField(cat.id); }}
                >
                  <Plus className="mr-1 h-3 w-3" /> Field
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => startEditCategory(cat)}>
                      <Pencil className="mr-2 h-4 w-4" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => handleToggleActive(cat)}>
                      <Power className="mr-2 h-4 w-4" />
                      {cat.isActive ? "Deactivate" : "Activate"}
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-destructive" onClick={() => setDeleteTarget(cat.id)}>
                      <Trash2 className="mr-2 h-4 w-4" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="border-t border-border px-5 py-4">
              {cat.fieldSchemas.length > 0 ? (
                <div className="space-y-2">
                  {cat.fieldSchemas.map((field, idx) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between rounded-lg border px-4 py-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <span className="flex h-6 w-6 items-center justify-center rounded bg-muted text-xs font-bold text-muted-foreground">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="text-sm font-medium">
                            {field.label}
                            {field.isRequired && <span className="ml-1 text-destructive">*</span>}
                          </p>
                          <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                            <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">{field.fieldKey}</code>
                            <Badge variant="secondary" className="text-[10px]">{field.fieldType}</Badge>
                            {field.hasPosition && <Badge variant="outline" className="text-[10px]">position</Badge>}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditField(cat.id, field)}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteFieldTarget(field.id)}>
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No fields yet. Add fields to define what users fill in during generation.
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    );
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Manage content categories, sub-categories, and their field schemas"
        actions={
          <Button onClick={() => { resetCreateForm(); setShowCreate(true); }}>
            <Plus className="mr-2 h-4 w-4" /> New Category
          </Button>
        }
      />

      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <Tabs value={filterType} onValueChange={setFilterType} className="self-start">
          <TabsList>
            <TabsTrigger value="ALL">All ({allFlat.length})</TabsTrigger>
            <TabsTrigger value="EVENT">Event ({allFlat.filter(c => c.contentType === "EVENT").length})</TabsTrigger>
            <TabsTrigger value="POSTER">Poster ({allFlat.filter(c => c.contentType === "POSTER").length})</TabsTrigger>
          </TabsList>
        </Tabs>
        
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input 
            type="search" 
            placeholder="Search categories..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <LoadingState message="Loading categories..." />
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-16">
          <Layers className="h-10 w-10 text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            {filterType === "ALL" ? "No categories configured yet." : `No ${filterType.toLowerCase()} categories.`}
          </p>
          <Button className="mt-4" size="sm" onClick={() => { resetCreateForm(); setShowCreate(true); }}>
            <Plus className="mr-2 h-4 w-4" /> Create Category
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((cat) => (
            <div key={cat.id}>
              {/* Parent category card */}
              {renderCategoryCard(cat, false)}

              {/* Sub-categories rendered with indent */}
              {cat.children && cat.children.length > 0 && (
                <div className="ml-8 mt-2 space-y-2 relative before:absolute before:left-0 before:top-0 before:bottom-4 before:w-px before:bg-border">
                  {cat.children.map((child) => (
                    <div key={child.id} className="relative pl-5">
                      <CornerDownRight className="absolute left-0 top-4 h-4 w-4 text-muted-foreground/50" />
                      {renderCategoryCard(child, true)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Category Dialog */}
      <FormDialog
        open={showCreate}
        onOpenChange={(open) => { if (!open) { setShowCreate(false); resetCreateForm(); } }}
        title={parentId ? "New Sub-category" : "New Category"}
        description={
          parentId
            ? "Sub-categories inherit their parent's content type and are grouped under the parent."
            : "Categories organize templates by type. Each category has its own set of input fields."
        }
        onSubmit={handleCreateCategory}
        submitLabel={parentId ? "Create Sub-category" : "Create Category"}
      >
        <FormField label="Parent Category" description="Leave empty to create a top-level category, or select a parent to create a sub-category.">
          <Select value={parentId ?? "__none__"} onValueChange={handleCreateParentChange}>
            <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (top-level)</SelectItem>
              {topLevel.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.contentType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Name" required description="Display name shown to users.">
          <Input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
            }}
            placeholder={parentId ? "e.g. Party Invitations" : "e.g. Birthday Invitations"}
            required
          />
        </FormField>
        <FormField label="Slug" required description="URL-friendly identifier, auto-generated from name.">
          <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="e.g. birthday-invitations" required />
        </FormField>
        <FormField label="Content Type" description={parentId ? "Inherited from parent category." : "Event categories appear in the event flow, Poster categories are standalone."}>
          <Select value={contentType} onValueChange={(v) => setContentType(v as "EVENT" | "POSTER")} disabled={!!parentId}>
            <SelectTrigger className={cn(parentId && "opacity-60")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EVENT">Event</SelectItem>
              <SelectItem value="POSTER">Poster</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Description" description="Internal note, not shown to users.">
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Templates for birthday party invitations" />
        </FormField>
      </FormDialog>

      {/* Edit Category Dialog */}
      <FormDialog
        open={showEdit}
        onOpenChange={(open) => { if (!open) { setShowEdit(false); setEditCatId(null); } }}
        title="Edit Category"
        description="Update category details. Changing the parent will move this category."
        onSubmit={handleUpdateCategory}
        submitLabel="Update Category"
      >
        <FormField label="Parent Category" description="Set to 'None' to make this a top-level category, or select a parent to move it.">
          <Select value={editParentId ?? "__none__"} onValueChange={handleEditParentChange}>
            <SelectTrigger><SelectValue placeholder="None (top-level)" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">None (top-level)</SelectItem>
              {getEditParentOptions().map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name} ({c.contentType})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Name" required description="Display name shown to users.">
          <Input
            value={editName}
            onChange={(e) => {
              setEditName(e.target.value);
              setEditSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""));
            }}
            placeholder="e.g. Birthday Invitations"
            required
          />
        </FormField>
        <FormField label="Slug" required description="URL-friendly identifier.">
          <Input value={editSlug} onChange={(e) => setEditSlug(e.target.value)} placeholder="e.g. birthday-invitations" required />
        </FormField>
        <FormField label="Content Type" description={editParentId ? "Inherited from parent category." : "Event categories appear in the event flow, Poster categories are standalone."}>
          <Select value={editContentType} onValueChange={(v) => setEditContentType(v as "EVENT" | "POSTER")} disabled={!!editParentId}>
            <SelectTrigger className={cn(editParentId && "opacity-60")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="EVENT">Event</SelectItem>
              <SelectItem value="POSTER">Poster</SelectItem>
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Description" description="Internal note, not shown to users.">
          <Input value={editDescription} onChange={(e) => setEditDescription(e.target.value)} placeholder="e.g. Templates for birthday party invitations" />
        </FormField>
      </FormDialog>

      {/* Field Form Dialog */}
      <FormDialog
        open={showFieldForm}
        onOpenChange={(open) => { if (!open) resetFieldForm(); }}
        title={editingFieldId ? "Edit Field" : "Add Field"}
        description={editingFieldId
          ? "Changes apply to future generations only."
          : "Define an input field for this category. Each field maps to a template placeholder."
        }
        onSubmit={handleSaveField}
        submitLabel={editingFieldId ? "Update" : "Add Field"}
      >
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Field Key" required description="Lowercase identifier used in template placeholders.">
            <Input
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
              placeholder="e.g. business_name"
              required
              disabled={!!editingFieldId}
            />
          </FormField>
          <FormField label="Display Label" required description="Label shown to users in the generation form.">
            <Input value={fieldLabel} onChange={(e) => setFieldLabel(e.target.value)} placeholder="e.g. Business Name" required />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Field Type" description="Input control type: TEXT, TEXTAREA, IMAGE, etc.">
            <Select value={fieldType} onValueChange={setFieldType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Placeholder" description="Hint text shown when the input is empty.">
            <Input value={fieldPlaceholder} onChange={(e) => setFieldPlaceholder(e.target.value)} placeholder="e.g. Enter your business name" />
          </FormField>
        </div>
        <div className="flex items-center gap-6">
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={fieldRequired} onCheckedChange={(v) => setFieldRequired(!!v)} />
            <span>Required</span>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={fieldHasPosition} onCheckedChange={(v) => setFieldHasPosition(!!v)} />
            <span>Has Position Selector</span>
          </label>
        </div>
      </FormDialog>

      {/* Confirm Dialogs */}
      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={() => setDeleteTarget(null)}
        title="Delete Category"
        description="This cannot be undone. Categories with sub-categories or templates attached cannot be deleted."
        onConfirm={handleDeleteCategory}
        confirmLabel="Delete"
        variant="destructive"
      />
      <ConfirmDialog
        open={!!deleteFieldTarget}
        onOpenChange={() => setDeleteFieldTarget(null)}
        title="Delete Field"
        description="Remove this field from the category schema? This cannot be undone."
        onConfirm={handleDeleteField}
        confirmLabel="Delete"
        variant="destructive"
      />
    </div>
  );
}
