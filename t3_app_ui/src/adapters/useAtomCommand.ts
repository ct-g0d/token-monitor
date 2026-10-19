export function useAtomCommand<T = any>(command: any, options?: any) {
  return async (args?: any): Promise<{ _tag: "Success"; value?: any }> => {
    return { _tag: "Success" };
  };
}
