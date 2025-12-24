import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { DataTable } from '@/components/DataTable';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { api } from '@/services/api';
import { Project } from '@/types';
import { Plus, Eye, Loader2, Settings, ExternalLink } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';

export default function Projects() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDocsDialogOpen, setIsDocsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [globalDocsUrl, setGlobalDocsUrl] = useState<string>('');
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    status: 'planning' as Project['status'],
    project_total_sqft: '' as string,
    project_docs_folder_url: '' as string,
    elevation_image_url: '' as string,
  });
  const navigate = useNavigate();

  useEffect(() => {
    // Wait for auth to be ready before fetching
    if (!authLoading && isAuthenticated) {
      fetchProjects();
    } else if (!authLoading && !isAuthenticated) {
      setIsLoading(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    const loadGlobalDocs = async () => {
      try {
        const data = await api.getGlobalDocsFolderUrl();
        setGlobalDocsUrl(data.global_docs_folder_url || '');
      } catch {
        setGlobalDocsUrl('');
      }
    };
    if (!authLoading && isAuthenticated) loadGlobalDocs();
  }, [authLoading, isAuthenticated]);

  const fetchProjects = async () => {
    setIsLoading(true);
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to load projects',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!formData.name || !formData.location) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      await api.createProject({
        name: formData.name,
        location: formData.location,
        status: formData.status,
        project_total_sqft: formData.project_total_sqft ? Number(formData.project_total_sqft) : null,
        project_docs_folder_url: formData.project_docs_folder_url || null,
        elevation_image_url: formData.elevation_image_url || null,
      } as any);
      toast({
        title: 'Success',
        description: 'Project created successfully',
      });
      setIsDialogOpen(false);
      setFormData({ name: '', location: '', status: 'planning', project_total_sqft: '', project_docs_folder_url: '', elevation_image_url: '' });
      fetchProjects();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to create project',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (status: Project['status']) => {
    const normalizedStatus = (() => {
      const s = String(status || '').toLowerCase().trim();
      if (s === 'ongoing' || s === 'planning' || s === 'completed') return s as Project['status'];
      if (s === 'active') return 'ongoing' as Project['status'];
      if (s === 'on-hold' || s === 'on_hold' || s === 'hold') return 'planning' as Project['status'];
      return 'planning' as Project['status'];
    })();

    const variants = {
      planning: 'bg-warning/10 text-warning border-warning/20',
      ongoing: 'bg-success/10 text-success border-success/20',
      completed: 'bg-primary/10 text-primary border-primary/20',
    };
    return (
      <Badge variant="outline" className={variants[normalizedStatus]}>
        {normalizedStatus.charAt(0).toUpperCase() + normalizedStatus.slice(1).replace('-', ' ')}
      </Badge>
    );
  };

  const columns = [
    { key: 'name' as const, header: 'Project Name' },
    { key: 'location' as const, header: 'Location' },
    { 
      key: 'status' as const, 
      header: 'Status',
      render: (project: Project) => getStatusBadge(project.status),
    },
    { 
      key: 'created_at' as const, 
      header: 'Created',
      render: (project: Project) => new Date(project.created_at).toLocaleDateString('en-IN'),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (project: Project) => (
        <Button 
          variant="ghost" 
          size="sm"
          onClick={() => navigate(`/projects/${project.id}`)}
        >
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
      ),
    },
  ];

  if (isLoading) {
    return (
      <Layout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="animate-fade-in">
        <PageHeader
          title="Projects"
          subtitle="Manage all construction projects"
          actions={[
            {
              label: 'Global Docs',
              icon: Settings,
              variant: 'outline',
              onClick: () => setIsDocsDialogOpen(true),
            },
            {
              label: 'Create Project',
              icon: Plus,
              onClick: () => setIsDialogOpen(true),
            },
          ]}
        />

        {globalDocsUrl ? (
          <div className="mb-4">
            <Button
              variant="outline"
              onClick={() => window.open(globalDocsUrl, '_blank', 'noopener,noreferrer')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />Open Global Docs Folder
            </Button>
          </div>
        ) : null}

        <DataTable
          data={projects}
          columns={columns}
          searchKeys={['name', 'location']}
          emptyMessage="No projects found. Create your first project!"
        />

        {/* Create Project Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Create a new construction project. You can add contributions, expenses, and flats after creation.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Enter project name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Location *</Label>
                <Input
                  id="location"
                  value={formData.location}
                  onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                  placeholder="City, State"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <Select
                  value={formData.status}
                  onValueChange={(value) => setFormData({ ...formData, status: value as Project['status'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="planning">Planning</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Project Total Sqft</Label>
                  <Input type="number" value={formData.project_total_sqft} onChange={(e) => setFormData({ ...formData, project_total_sqft: e.target.value })} placeholder="e.g. 2500" />
                </div>
                <div className="space-y-2">
                  <Label>Project Docs Folder URL</Label>
                  <Input value={formData.project_docs_folder_url} onChange={(e) => setFormData({ ...formData, project_docs_folder_url: e.target.value })} placeholder="Google Drive folder URL" />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Elevation Image URL</Label>
                <Input value={formData.elevation_image_url} onChange={(e) => setFormData({ ...formData, elevation_image_url: e.target.value })} placeholder="Image URL" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Project
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={isDocsDialogOpen} onOpenChange={setIsDocsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Global Docs Folder</DialogTitle>
              <DialogDescription>Set a global Google Drive folder URL for all projects.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Global Docs Folder URL</Label>
                <Input value={globalDocsUrl} onChange={(e) => setGlobalDocsUrl(e.target.value)} placeholder="Google Drive folder URL" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDocsDialogOpen(false)}>Cancel</Button>
              <Button
                onClick={async () => {
                  setIsSubmitting(true);
                  try {
                    const saved = await api.updateGlobalDocsFolderUrl(globalDocsUrl ? globalDocsUrl : null);
                    setGlobalDocsUrl(saved.global_docs_folder_url || '');
                    toast({ title: 'Saved', description: 'Global docs folder updated' });
                    setIsDocsDialogOpen(false);
                  } catch (e) {
                    toast({ title: 'Error', description: e instanceof Error ? e.message : 'Failed to save', variant: 'destructive' });
                  } finally {
                    setIsSubmitting(false);
                  }
                }}
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
