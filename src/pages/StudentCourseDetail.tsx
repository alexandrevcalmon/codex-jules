
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  PlayCircle, 
  Clock, 
  Users, 
  Trophy,
  ArrowLeft,
  BookOpen,
  Lock
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth';
import { useAutoEnrollment } from '@/hooks/useAutoEnrollment';
import { useUserQuizAttempts, useLessonQuizzes } from '@/hooks/useQuizzes';

const StudentCourseDetail = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { mutate: autoEnroll } = useAutoEnrollment();

  // Auto-enroll when user accesses course
  useEffect(() => {
    if (courseId && user?.id) {
      autoEnroll({ courseId, userId: user.id });
    }
  }, [courseId, user?.id, autoEnroll]);

  // Fetch course details
  const { data: course, isLoading: courseLoading } = useQuery({
    queryKey: ['course-detail', courseId],
    queryFn: async () => {
      if (!courseId) throw new Error('Course ID is required');
      
      const { data, error } = await supabase
        .from('courses')
        .select(`
          *,
          is_sequential,
          course_modules (
            id,
            title,
            description,
            order_index,
            lessons (
              id,
              title,
              duration_minutes,
              order_index,
              is_free,
              is_optional
            )
          )
        `)
        .eq('id', courseId)
        .eq('is_published', true)
        .single();

      if (error) {
        console.error('Error fetching course:', error);
        throw error;
      }

      // Sort modules and lessons by order_index
      if (data.course_modules) {
        data.course_modules.sort((a: any, b: any) => a.order_index - b.order_index);
        data.course_modules.forEach((module: any) => {
          if (module.lessons) {
            module.lessons.sort((a: any, b: any) => a.order_index - b.order_index);
          }
        });
      }

      return data;
    },
    enabled: !!courseId,
  });

  // Fetch enrollment and progress
  const { data: enrollment } = useQuery({
    queryKey: ['enrollment', courseId, user?.id],
    queryFn: async () => {
      if (!courseId || !user?.id) return null;
      
      const { data, error } = await supabase
        .from('enrollments')
        .select('*')
        .eq('course_id', courseId)
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching enrollment:', error);
        throw error;
      }

      return data;
    },
    enabled: !!courseId && !!user?.id,
  });

  // Fetch lesson progress
  const { data: lessonsProgress } = useQuery({
    queryKey: ['lessons-progress', courseId, user?.id],
    queryFn: async () => {
      if (!courseId || !user?.id) return [];
      
      const { data, error } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed, watch_time_seconds')
        .eq('user_id', user.id);

      if (error) {
        console.error('Error fetching lesson progress:', error);
        return [];
      }

      return data || [];
    },
    enabled: !!courseId && !!user?.id,
  });

  const handleStartLesson = (lessonId: string) => {
    navigate(`/student/courses/${courseId}/lessons/${lessonId}`);
  };

  // 1. Carregue o curso normalmente (já feito)
  // 2. Só depois de course carregado, monte lessonIds e chame os hooks de quizzes/tentativas
  let lessonIds: string[] = [];
  if (course?.course_modules) {
    lessonIds = course.course_modules.flatMap((module: any) => module.lessons?.map((lesson: any) => lesson.id)) || [];
  }

  // 3. Só busque quizzes/tentativas se lessonIds estiver disponível
  const { data: allQuizzes = [], isLoading: quizzesLoading } = useQuery({
    queryKey: ['all-quizzes', lessonIds],
    queryFn: async () => {
      if (!lessonIds.length) return [];
      const { data, error } = await supabase
        .from('quizzes')
        .select('*')
        .in('lesson_id', lessonIds);
      if (error) throw error;
      return data;
    },
    enabled: !!lessonIds.length,
  });

  const quizIds = allQuizzes.map((quiz: any) => quiz.id);
  const { data: allAttempts = [], isLoading: attemptsLoading } = useQuery({
    queryKey: ['all-quiz-attempts', quizIds],
    queryFn: async () => {
      if (!quizIds.length) return [];
      const { data, error } = await supabase
        .from('quiz_attempts')
        .select('*')
        .in('quiz_id', quizIds);
      if (error) throw error;
      return data;
    },
    enabled: !!quizIds.length,
  });

  // 4. Monte os dicionários
  const quizzesByLesson: Record<string, any[]> = {};
  allQuizzes.forEach((quiz: any) => {
    if (!quizzesByLesson[quiz.lesson_id]) quizzesByLesson[quiz.lesson_id] = [];
    quizzesByLesson[quiz.lesson_id].push(quiz);
  });
  const attemptsByLesson: Record<string, any[]> = {};
  allAttempts.forEach((attempt: any) => {
    const quiz = allQuizzes.find((q: any) => q.id === attempt.quiz_id);
    if (quiz && quiz.lesson_id) {
      if (!attemptsByLesson[quiz.lesson_id]) attemptsByLesson[quiz.lesson_id] = [];
      attemptsByLesson[quiz.lesson_id].push(attempt);
    }
  });

  // 5. Só renderize a lista de aulas se quizzes/tentativas estiverem carregados
  if (quizzesLoading || attemptsLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Carregando dados das aulas...</p>
        </div>
      </div>
    );
  }

  if (courseLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-2"></div>
          <p className="text-gray-600">Carregando curso...</p>
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="text-center py-8">
        <h2 className="text-xl font-semibold text-gray-900 mb-2">Curso não encontrado</h2>
        <p className="text-gray-600 mb-4">O curso que você está procurando não existe ou não está disponível.</p>
        <Button onClick={() => navigate('/student/courses')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar para Cursos
        </Button>
      </div>
    );
  }

  // Calculate progress
  const allLessons = course.course_modules?.flatMap((module: any) => module.lessons || []) || [];
  const completedLessons = allLessons.filter((lesson: any) => 
    lessonsProgress?.some(progress => progress.lesson_id === lesson.id && progress.completed)
  );
  const progressPercentage = allLessons.length > 0 ? (completedLessons.length / allLessons.length) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* Back button */}
      <Button variant="outline" onClick={() => navigate('/student/courses')}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Cursos
      </Button>

      {/* Course Header */}
      <Card>
        <CardHeader>
          <div className="flex flex-col lg:flex-row gap-6">
            {course.thumbnail_url && (
              <img 
                src={course.thumbnail_url} 
                alt={course.title}
                className="w-full lg:w-80 h-48 object-cover rounded-lg"
              />
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="secondary">{course.category}</Badge>
                <Badge variant="outline">{course.difficulty_level}</Badge>
              </div>
              <CardTitle className="text-2xl mb-2">{course.title}</CardTitle>
              <p className="text-gray-600 mb-4">{course.description}</p>
              
              {/* Course Stats */}
              <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-4">
                {course.estimated_hours && (
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>{course.estimated_hours} horas</span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <BookOpen className="h-4 w-4" />
                  <span>{allLessons.length} aulas</span>
                </div>
                <div className="flex items-center gap-1">
                  <Trophy className="h-4 w-4" />
                  <span>{completedLessons.length} concluídas</span>
                </div>
              </div>

              {/* Progress */}
              {enrollment && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Progresso do Curso</span>
                    <span>{Math.round(progressPercentage)}%</span>
                  </div>
                  <Progress value={progressPercentage} className="h-2" />
                </div>
              )}
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* Course Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Modules and Lessons */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="text-xl font-semibold">Conteúdo do Curso</h2>
          
          {course.course_modules && course.course_modules.length > 0 ? (
            course.course_modules.map((module: any) => (
              <Card key={module.id}>
                <CardHeader>
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  {module.description && (
                    <p className="text-gray-600">{module.description}</p>
                  )}
                </CardHeader>
                <CardContent>
                  {module.lessons && module.lessons.length > 0 ? (
                    <div className="space-y-2">
                      {module.lessons.map((lesson: any) => {
                        const lessonProgress = lessonsProgress?.find(p => p.lesson_id === lesson.id);
                        const isCompleted = lessonProgress?.completed || false;
                        // Lógica de bloqueio sequencial GLOBAL
                        let isBlocked = false;
                        const isSequential = course.is_sequential;
                        const userRole = user?.user_metadata?.role;
                        const globalIdx = allLessons.findIndex((l: any) => l.id === lesson.id);
                        let prevCompleted = null;
                        let prevQuizPassed = null;
                        if (isSequential && userRole === 'collaborator') {
                          if (globalIdx === 0) {
                            isBlocked = false;
                          } else if (lesson.is_optional) {
                            isBlocked = false;
                          } else {
                            // Verifica se a aula anterior foi concluída e quiz aprovado (se houver)
                            const prevLesson = allLessons[globalIdx - 1];
                            const prevProgress = lessonsProgress?.find(p => p.lesson_id === prevLesson.id);
                            prevCompleted = prevProgress?.completed || false;
                            const prevQuiz = quizzesByLesson[prevLesson.id];
                            const prevAttempt = attemptsByLesson[prevLesson.id];
                            prevQuizPassed = prevQuiz ? prevAttempt?.passed : true;
                            isBlocked = !(prevCompleted && prevQuizPassed);
                          }
                        }
                        // LOG DE DEPURAÇÃO
                        console.log('[AULA]', {
                          idx: globalIdx,
                          id: lesson.id,
                          title: lesson.title,
                          isCompleted,
                          isBlocked,
                          prevCompleted,
                          prevQuizPassed,
                          is_optional: lesson.is_optional,
                        });
                        // Visual do botão
                        return (
                          <div 
                            key={lesson.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs ${
                                isCompleted 
                                  ? 'bg-green-100 text-green-700' 
                                  : 'bg-gray-100 text-gray-600'
                              }`}>
                                {isCompleted ? '✓' : lesson.order_index}
                              </div>
                              <div>
                                <h4 className="font-medium">{lesson.title}</h4>
                                {lesson.duration_minutes && (
                                  <p className="text-sm text-gray-600">
                                    {lesson.duration_minutes} minutos
                                  </p>
                                )}
                              </div>
                              {lesson.is_free && (
                                <Badge variant="outline" className="ml-2">Grátis</Badge>
                              )}
                              {lesson.is_optional && (
                                <Badge variant="secondary" className="ml-2">Não obrigatória</Badge>
                              )}
                            </div>
                            <Button 
                              onClick={() => handleStartLesson(lesson.id)}
                              size="sm"
                              variant={isCompleted ? "outline" : "default"}
                              disabled={isBlocked}
                              className={isBlocked ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : 'bg-blue-600 text-white'}
                            >
                              {isBlocked ? <><Lock className="inline mr-1" size={16}/> Bloqueado</> : <><PlayCircle className="inline mr-1" size={16}/> Assistir</>}
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-gray-500 italic">Nenhuma aula disponível neste módulo.</p>
                  )}
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <BookOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum módulo disponível</h3>
                <p className="text-gray-600">Este curso ainda não possui módulos publicados.</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Course Info Sidebar */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Informações do Curso</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Nível</h4>
                <p className="text-gray-600 capitalize">{course.difficulty_level}</p>
              </div>
              
              <div>
                <h4 className="font-medium text-gray-900 mb-1">Categoria</h4>
                <p className="text-gray-600">{course.category}</p>
              </div>

              {course.estimated_hours && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">Duração Estimada</h4>
                  <p className="text-gray-600">{course.estimated_hours} horas</p>
                </div>
              )}

              <div>
                <h4 className="font-medium text-gray-900 mb-1">Total de Aulas</h4>
                <p className="text-gray-600">{allLessons.length} aulas</p>
              </div>

              {enrollment && (
                <div>
                  <h4 className="font-medium text-gray-900 mb-1">Progresso</h4>
                  <p className="text-gray-600">{completedLessons.length} de {allLessons.length} aulas concluídas</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default StudentCourseDetail;
