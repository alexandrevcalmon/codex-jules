
import { useState, useMemo, useEffect } from 'react';
import { LessonHeader } from './LessonHeader';
import { LessonVideoSection } from './LessonVideoSection';
import { LessonContent } from './LessonContent';
import { LessonSidebar } from './LessonSidebar';
import { AIChatWidget } from '@/components/lesson/AIChatWidget';
import { StudentLesson, StudentCourse } from '@/hooks/useStudentCourses';
import { useLessonQuizzes } from '@/hooks/useQuizzes';
import { useRegisterQuizAttempt, useLastUserQuizAttempt } from '@/hooks/useQuizzes';
import { Button } from '@/components/ui/button';
import { useUpdateLessonProgress } from '@/hooks/progress/useUpdateLessonProgress';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/auth';

interface LessonViewContentProps {
  currentLesson: any;
  course: StudentCourse;
  courseId: string;
  currentModule?: { title: string } | null;
  prevLesson?: { id: string; title: string };
  nextLesson?: { id: string; title: string };
  companyId: string;
}

export const LessonViewContent = ({
  currentLesson,
  course,
  courseId,
  currentModule,
  prevLesson,
  nextLesson,
  companyId
}: LessonViewContentProps) => {
  const navigate = useNavigate();
  const { userRole } = useAuth();
  const [watchTime, setWatchTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [quizModalOpen, setQuizModalOpen] = useState(false);
  const { data: quizzes = [], isLoading: quizzesLoading } = useLessonQuizzes(currentLesson.id);
  const quiz = useMemo(() => quizzes[0], [quizzes]); // Considera apenas o primeiro quiz por aula
  const { data: lastAttempt } = useLastUserQuizAttempt(quiz?.id, currentLesson.id);
  const registerQuizAttempt = useRegisterQuizAttempt();
  const updateLessonProgress = useUpdateLessonProgress();

  // Dados do quiz da aula anterior
  const { data: prevQuizzes = [] } = useLessonQuizzes(prevLesson?.id || '');
  const prevQuiz = useMemo(() => prevQuizzes[0], [prevQuizzes]);
  const { data: prevAttempt } = useLastUserQuizAttempt(prevQuiz?.id, prevLesson?.id);

  const [quizAnswers, setQuizAnswers] = useState<any>({});
  const [quizSubmitting, setQuizSubmitting] = useState(false);
  const [quizError, setQuizError] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<null | { score: number; passed: boolean }>(null);

  const handleQuizAnswerChange = (questionIdx: number, value: string) => {
    setQuizAnswers((prev: any) => ({ ...prev, [questionIdx]: value }));
  };

  const handleQuizRealSubmit = () => {
    if (!quiz) return;
    setQuizSubmitting(true);
    setQuizError(null);
    // Corrigir: checar se todas as perguntas foram respondidas
    if (quiz.questions.some((_: any, idx: number) => !quizAnswers[idx])) {
      setQuizError('Responda todas as perguntas antes de enviar.');
      setQuizSubmitting(false);
      return;
    }
    // Corrigir: calcular score real
    let correctAnswers = 0;
    quiz.questions.forEach((q: any, idx: number) => {
      if (quizAnswers[idx] === q.correta) correctAnswers++;
    });
    const score = (correctAnswers / quiz.questions.length) * 100;
    const passed = score >= 75;
    setQuizResult({ score, passed });
    handleQuizSubmit(quizAnswers, correctAnswers, quiz.questions.length);
    // NOVO: Se passou no quiz e progresso >= 95%, marca aula como concluída
    if (passed && progressPercentage >= 95) {
      updateLessonProgress.mutate({ lessonId: currentLesson.id, completed: true });
    }
    setQuizSubmitting(false);
    setQuizAnswers({});
  };

  const handleCloseQuizModal = () => {
    setQuizModalOpen(false);
    setQuizAnswers({});
    setQuizError(null);
    setQuizResult(null);
  };

  // Progresso do vídeo
  const progressPercentage = duration > 0 ? (watchTime / duration) * 100 : 0;
  const quizEnabled = progressPercentage >= 95;
  const quizPassed = lastAttempt?.passed;
  const quizScore = lastAttempt?.score || 0;

  // Aula só pode ser considerada concluída para avanço se progresso local >= 95% e (quiz aprovado ou não houver quiz)
  // Nunca dependa apenas de currentLesson.completed do backend para liberar o botão de próxima aula!
  const lessonReallyCompleted = (progressPercentage >= 95) && (!quiz || quizPassed);

  // Handler para submissão do quiz (simulação, adapte para seu fluxo real)
  const handleQuizSubmit = (answers: any, correctAnswers: number, totalQuestions: number) => {
    const score = (correctAnswers / totalQuestions) * 100;
    const passed = score >= 75;
    registerQuizAttempt.mutate({
      lesson_id: currentLesson.id,
      quiz_id: quiz.id,
      score,
      total_questions: totalQuestions,
      correct_answers: correctAnswers,
      answers,
      passed,
    }, {
      onSuccess: () => {
        setQuizModalOpen(false);
        if (!passed) {
          // Reverter conclusão da aula
          updateLessonProgress.mutate({ lessonId: currentLesson.id, completed: false });
          toast.error('Você não atingiu 75% de acerto. Assista novamente a aula e refaça o quiz.');
        }
      }
    });
  };

  // Corrige erro: define handleTimeUpdate
  const handleTimeUpdate = (currentTime: number, videoDuration: number) => {
    setWatchTime(currentTime);
    setDuration(videoDuration);
  };

  // Convert lesson to StudentLesson format for components
  const studentLesson: StudentLesson = {
    ...currentLesson,
    completed: currentLesson.completed || false,
    watch_time_seconds: currentLesson.watch_time_seconds || 0,
    video_file_url: currentLesson.video_file_url || null,
    material_url: currentLesson.material_url || null,
  };

  // Definir bloqueio de avanço
  const nextLessonBlocked = !(progressPercentage >= 95 && (!quiz || quizPassed));
  const nextLessonBlockedReason = nextLessonBlocked ? 'Você precisa assistir a aula e acertar pelo menos 75% no quiz para avançar para a próxima aula.' : undefined;
  // O botão do quiz deve aparecer se: há quiz, progresso >= 95%, e ainda não passou no quiz
  const showQuizButton = quiz && quizEnabled && !quizPassed;
  const nextLessonBlockedAction = showQuizButton ? (
    <Button size="sm" className="bg-blue-600 text-white" onClick={() => setQuizModalOpen(true)}>
      Responder Quiz
    </Button>
  ) : null;

  useEffect(() => {
    if (lessonReallyCompleted) {
      toast.success('Aula concluída! Você pode avançar para a próxima aula.');
    }
  }, [lessonReallyCompleted]);

  useEffect(() => {
    // Bloqueio de navegação direta para aulas não liberadas
    const isSequential = course?.is_sequential;
    if (isSequential && userRole === 'collaborator') {
      if (prevLesson && !currentLesson.is_optional) {
        const prevLessonCompleted = (prevLesson as any).completed;
        const prevQuizPassed = prevQuiz ? prevAttempt?.passed : true;
        if (!prevLessonCompleted || !prevQuizPassed) {
          navigate(`/student/courses/${courseId}/lessons/${prevLesson.id}`);
        }
      }
    }
  }, [course, currentLesson, prevLesson, courseId, navigate, userRole, prevAttempt, prevQuiz]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <LessonHeader 
        currentLesson={studentLesson} 
        course={course} 
        courseId={courseId}
        currentModule={currentModule}
      />

      {/* Main Content */}
      <div className="w-full px-3 sm:px-4 lg:px-6 py-3 sm:py-4 lg:py-6">
        <div className="max-w-7xl mx-auto">
          {/* Mobile Layout - Stack vertically */}
          <div className="block lg:hidden space-y-4">
            {/* Video Section */}
            <LessonVideoSection
              currentLesson={studentLesson}
              course={course}
              onTimeUpdate={handleTimeUpdate}
            />
            {/* Quiz Modal (simples, substitua por seu componente real) */}
            {quizModalOpen && quiz && (
              <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                <div className="bg-white p-6 rounded shadow-lg w-full max-w-lg">
                  <h2 className="text-lg font-bold mb-4">Quiz da Aula</h2>
                  <div className="max-h-[70vh] overflow-y-auto pr-2">
                    {quizResult ? (
                      <div className="flex flex-col items-center justify-center gap-4 py-6">
                        <div className={`text-2xl font-bold ${quizResult.passed ? 'text-green-600' : 'text-red-600'}`}>{quizResult.score.toFixed(0)}%</div>
                        <div className="text-lg font-medium text-center">
                          {quizResult.passed ? (
                            <>
                              Parabéns! Você atingiu o percentual necessário e pode avançar para a próxima aula.
                            </>
                          ) : (
                            <>
                              Você não atingiu 75% de acerto.<br />Assista novamente a aula e tente o quiz de novo.
                            </>
                          )}
                        </div>
                        <Button className="mt-2" onClick={handleCloseQuizModal}>Fechar</Button>
                      </div>
                    ) : (
                      <form onSubmit={e => { e.preventDefault(); handleQuizRealSubmit(); }}>
                        {quiz.questions.map((q: any, idx: number) => (
                          <div key={idx} className="mb-4">
                            <div className="font-medium mb-2">{idx + 1}. {q.pergunta}</div>
                            <div className="space-y-2">
                              {q.alternativas.map((alt: string, altIdx: number) => (
                                <label key={altIdx} className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="radio"
                                    name={`question-${idx}`}
                                    value={alt}
                                    checked={quizAnswers[idx] === alt}
                                    onChange={() => handleQuizAnswerChange(idx, alt)}
                                    className="accent-blue-600"
                                  />
                                  <span>{alt}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}
                        {quizError && <div className="text-red-600 text-sm mb-2">{quizError}</div>}
                        <div className="flex justify-end gap-2 mt-4">
                          <Button type="button" variant="outline" onClick={handleCloseQuizModal}>Cancelar</Button>
                          <Button type="submit" className="bg-blue-600 text-white" disabled={quizSubmitting}>Enviar Respostas</Button>
                        </div>
                      </form>
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {/* Progress and Navigation */}
            <LessonSidebar
              currentLesson={studentLesson}
              courseId={courseId}
              watchTime={watchTime}
              duration={duration}
              prevLesson={prevLesson}
              nextLesson={nextLesson}
              nextLessonBlocked={nextLessonBlocked}
              nextLessonBlockedReason={nextLessonBlockedReason}
              nextLessonBlockedAction={nextLessonBlockedAction}
            />
            
            {/* Content */}
            <LessonContent 
              currentLesson={studentLesson} 
              currentModule={currentModule}
            />
          </div>

          {/* Desktop Layout - Grid */}
          <div className="hidden lg:grid lg:grid-cols-4 gap-6">
            {/* Main Content - Left side */}
            <div className="lg:col-span-3 space-y-6">
              <LessonVideoSection
                currentLesson={studentLesson}
                course={course}
                onTimeUpdate={handleTimeUpdate}
              />
              {/* Quiz Modal (simples, substitua por seu componente real) */}
              {quizModalOpen && quiz && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                  <div className="bg-white p-6 rounded shadow-lg w-full max-w-lg">
                    <h2 className="text-lg font-bold mb-4">Quiz da Aula</h2>
                    <div className="max-h-[70vh] overflow-y-auto pr-2">
                      {quizResult ? (
                        <div className="flex flex-col items-center justify-center gap-4 py-6">
                          <div className={`text-2xl font-bold ${quizResult.passed ? 'text-green-600' : 'text-red-600'}`}>{quizResult.score.toFixed(0)}%</div>
                          <div className="text-lg font-medium text-center">
                            {quizResult.passed ? (
                              <>
                                Parabéns! Você atingiu o percentual necessário e pode avançar para a próxima aula.
                              </>
                            ) : (
                              <>
                                Você não atingiu 75% de acerto.<br />Assista novamente a aula e tente o quiz de novo.
                              </>
                            )}
                          </div>
                          <Button className="mt-2" onClick={handleCloseQuizModal}>Fechar</Button>
                        </div>
                      ) : (
                        <form onSubmit={e => { e.preventDefault(); handleQuizRealSubmit(); }}>
                          {quiz.questions.map((q: any, idx: number) => (
                            <div key={idx} className="mb-4">
                              <div className="font-medium mb-2">{idx + 1}. {q.pergunta}</div>
                              <div className="space-y-2">
                                {q.alternativas.map((alt: string, altIdx: number) => (
                                  <label key={altIdx} className="flex items-center gap-2 cursor-pointer">
                                    <input
                                      type="radio"
                                      name={`question-${idx}`}
                                      value={alt}
                                      checked={quizAnswers[idx] === alt}
                                      onChange={() => handleQuizAnswerChange(idx, alt)}
                                      className="accent-blue-600"
                                    />
                                    <span>{alt}</span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          ))}
                          {quizError && <div className="text-red-600 text-sm mb-2">{quizError}</div>}
                          <div className="flex justify-end gap-2 mt-4">
                            <Button type="button" variant="outline" onClick={handleCloseQuizModal}>Cancelar</Button>
                            <Button type="submit" className="bg-blue-600 text-white" disabled={quizSubmitting}>Enviar Respostas</Button>
                          </div>
                        </form>
                      )}
                    </div>
                  </div>
                </div>
              )}
              
              <LessonContent 
                currentLesson={studentLesson} 
                currentModule={currentModule}
              />
            </div>

            {/* Sidebar - Right side */}
            <div className="lg:col-span-1">
              <LessonSidebar
                currentLesson={studentLesson}
                courseId={courseId}
                watchTime={watchTime}
                duration={duration}
                prevLesson={prevLesson}
                nextLesson={nextLesson}
                nextLessonBlocked={nextLessonBlocked}
                nextLessonBlockedReason={nextLessonBlockedReason}
                nextLessonBlockedAction={nextLessonBlockedAction}
              />
            </div>
          </div>
        </div>
      </div>

      {/* AI Chat Widget */}
      <AIChatWidget
        lessonId={currentLesson.id}
        companyId={companyId}
      />
    </div>
  );
};
