export function createSaveOperationController(onStateChange = () => {}) {
  const activeOperations = new Set();
  const errors = {};

  const notify = () => {
    onStateChange({
      activeOperations: Array.from(activeOperations),
      errors: { ...errors },
    });
  };

  return {
    async run(operationKey, saveTask) {
      if (activeOperations.has(operationKey)) {
        throw new Error('이미 저장 중입니다. 잠시만 기다려 주세요.');
      }

      activeOperations.add(operationKey);
      delete errors[operationKey];
      notify();

      try {
        return await saveTask();
      } catch (err) {
        errors[operationKey] = err instanceof Error
          ? err.message
          : '저장 중 알 수 없는 오류가 발생했습니다.';
        notify();
        throw err;
      } finally {
        activeOperations.delete(operationKey);
        notify();
      }
    },

    isPending(operationKey) {
      return activeOperations.has(operationKey);
    },

    getError(operationKey) {
      return errors[operationKey] || '';
    },
  };
}
