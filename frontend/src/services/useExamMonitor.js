import { useEffect, useRef } from 'react';

export function useExamMonitor({
  enabled,
  section,
  questionId,
  isInternalDialogOpen = false,
  exitingLegitimatelyRef,
  onReportViolation,
}) {
  const latestRef = useRef({
    section,
    questionId,
    isInternalDialogOpen,
    onReportViolation,
  });

  useEffect(() => {
    latestRef.current = {
      section,
      questionId,
      isInternalDialogOpen,
      onReportViolation,
    };
  }, [section, questionId, isInternalDialogOpen, onReportViolation]);

  useEffect(() => {
    if (!enabled) return undefined;

    let blurTimer = null;

    const emit = (type) => {
      if (exitingLegitimatelyRef?.current) return;
      const { section: sec, questionId: qId, onReportViolation: report } = latestRef.current;
      if (typeof report === 'function') {
        report({ type, section: sec || null, questionId: qId || null });
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        if (blurTimer) {
          clearTimeout(blurTimer);
          blurTimer = null;
        }
        emit('tab_hidden');
      }
    };

    const handleFullscreenChange = () => {
      if (!document.fullscreenElement) {
        emit('fullscreen_exit');
      }
    };

    const handleWindowBlur = () => {
      if (blurTimer) clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        blurTimer = null;
        if (
          latestRef.current.isInternalDialogOpen ||
          document.visibilityState === 'hidden' ||
          exitingLegitimatelyRef?.current
        ) {
          return;
        }
        if (typeof document.hasFocus === 'function' && document.hasFocus()) {
          return;
        }
        emit('window_blur');
      }, 500);
    };

    const handleWindowFocus = () => {
      if (blurTimer) {
        clearTimeout(blurTimer);
        blurTimer = null;
      }
    };

    const handleRestrictedClipboard = (e) => {
      const target = e.target;
      if (!(target instanceof Element)) return;
      if (!target.closest('.exam-question-col')) return;
      if (
        target.closest('.monaco-editor') ||
        target.closest('[data-allow-paste="true"]') ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'INPUT'
      ) {
        return;
      }
      e.preventDefault();
      emit('copy_paste');
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('focus', handleWindowFocus);
    document.addEventListener('copy', handleRestrictedClipboard);
    document.addEventListener('cut', handleRestrictedClipboard);
    document.addEventListener('paste', handleRestrictedClipboard);
    document.addEventListener('contextmenu', handleRestrictedClipboard);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('focus', handleWindowFocus);
      document.removeEventListener('copy', handleRestrictedClipboard);
      document.removeEventListener('cut', handleRestrictedClipboard);
      document.removeEventListener('paste', handleRestrictedClipboard);
      document.removeEventListener('contextmenu', handleRestrictedClipboard);
    };
  }, [enabled, exitingLegitimatelyRef]);
}
