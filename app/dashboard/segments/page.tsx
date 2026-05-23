import { Metadata } from 'next';
import { getSession } from '@/lib/auth/session';

export const metadata: Metadata = {
  title: 'Segments',
};
import { db, segments, projects } from '@/lib/db';
import { eq, desc } from 'drizzle-orm';
import { redirect } from 'next/navigation';
import { getCurrentProjectWithRole } from '@/lib/utils/project';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Plus, Filter, Trash2 } from 'lucide-react';
import { SegmentDialog } from '@/components/dashboard/segment-dialog';
import { RoleBadge } from '@/components/dashboard/role-badge';
import { deleteSegment } from '@/lib/actions/segments';

interface SegmentFilter {
  field: string;
  operator: string;
  value: string;
}

interface SegmentFilters {
  logic: 'and' | 'or';
  conditions: SegmentFilter[];
}

async function getSegmentsData(projectId: string) {
  const userSegments = await db.query.segments.findMany({
    where: eq(segments.projectId, projectId),
    orderBy: desc(segments.createdAt),
  });

  return userSegments.map(segment => ({
    ...segment,
    filters: segment.filters as SegmentFilters,
  }));
}

export default async function SegmentsPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/signin');
  }

  const membership = await getCurrentProjectWithRole(session.userId);

  if (!membership) {
    return (
      <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
        <div className="w-full max-w-5xl">
          <h1 className="text-2xl font-bold mb-4">Segments</h1>
          <p className="text-muted-foreground">No projects found.</p>
        </div>
      </div>
    );
  }
  const { project, role } = membership;
  const canEdit = role === 'owner' || role === 'editor';
  const segmentsData = await getSegmentsData(project.id);

  return (
    <div className="min-h-full p-4 sm:p-6 lg:p-8 flex justify-center">
      <div className="w-full max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">Segments</h1>
              {role !== 'owner' && <RoleBadge role={role} />}
            </div>
            <p className="text-muted-foreground">
              Create and manage audience segments
            </p>
          </div>
          {canEdit && (
            <SegmentDialog projectId={project.id}>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Create Segment
              </Button>
            </SegmentDialog>
          )}
        </div>

        {segmentsData.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Filter className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No segments yet</h3>
              <p className="text-muted-foreground text-center mb-4">
                Create segments to filter and analyze specific user groups.
              </p>
              {canEdit && (
                <SegmentDialog projectId={project.id}>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create your first segment
                  </Button>
                </SegmentDialog>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {segmentsData.map((segment) => (
              <Card key={segment.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{segment.name}</CardTitle>
                    {canEdit && (
                      <form action={deleteSegment.bind(null, segment.id)}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <Badge variant="outline" className="uppercase text-xs">
                      {segment.filters.logic}
                    </Badge>
                    <div className="space-y-1">
                      {segment.filters.conditions.slice(0, 3).map((condition, index) => (
                        <p key={index} className="text-sm text-muted-foreground">
                          {condition.field} {condition.operator} {condition.value}
                        </p>
                      ))}
                      {segment.filters.conditions.length > 3 && (
                        <p className="text-sm text-muted-foreground">
                          +{segment.filters.conditions.length - 3} more conditions
                        </p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
