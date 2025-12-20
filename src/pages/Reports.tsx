import { useState, useEffect } from 'react';
import { Layout } from '@/components/Layout';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { api } from '@/services/api';
import { Project } from '@/types';
import { FileSpreadsheet, FileText, Building2, Loader2 } from 'lucide-react';

export default function Reports() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchProjects = async () => {
      try {
        const data = await api.getProjects();
        setProjects(data);
        if (data.length > 0) setSelectedProject(data[0].id);
      } catch (error) {
        console.error('Failed to fetch projects:', error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchProjects();
  }, []);

  const handleDownload = (reportType: string) => {
    if (!selectedProject) {
      toast({
        title: 'Select a Project',
        description: 'Please select a project to generate the report',
        variant: 'destructive',
      });
      return;
    }
    toast({
      title: 'Generating Report',
      description: `Downloading ${reportType}...`,
    });
    // API call would happen here
    console.log(`[REPORT API] Generating ${reportType} for project ${selectedProject}`);
  };

  const reports = [
    {
      title: 'Contribution Report',
      description: 'All partner contributions with dates and payment modes',
      icon: FileSpreadsheet,
      type: 'contributions',
    },
    {
      title: 'Expense Report',
      description: 'Complete expense breakdown by category and vendor',
      icon: FileText,
      type: 'expenses',
    },
    {
      title: 'Flat Report',
      description: 'Flat sales, installments, and pending dues',
      icon: Building2,
      type: 'flats',
    },
    {
      title: 'Full Project Report',
      description: 'Comprehensive report with all financial data',
      icon: FileSpreadsheet,
      type: 'full',
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
          title="Reports"
          subtitle="Generate and download project reports"
        />

        {/* Project Selector */}
        <div className="bg-card rounded-lg border border-border p-4 mb-6">
          <label className="text-sm font-medium text-card-foreground mb-2 block">Select Project</label>
          <Select value={selectedProject} onValueChange={setSelectedProject}>
            <SelectTrigger className="max-w-md">
              <SelectValue placeholder="Select a project" />
            </SelectTrigger>
            <SelectContent>
              {projects.map((project) => (
                <SelectItem key={project.id} value={project.id}>
                  {project.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {reports.map((report) => (
            <Card key={report.type} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="p-2 rounded-lg bg-primary/10 w-fit mb-2">
                  <report.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{report.title}</CardTitle>
                <CardDescription className="text-sm">{report.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  variant="outline" 
                  className="w-full"
                  onClick={() => handleDownload(report.type)}
                >
                  Download Excel
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
