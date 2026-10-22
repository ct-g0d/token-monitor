export function useAtomCommand<T = any>(command: any, _options?: any) {
  return async (args?: any): Promise<{ _tag: "Success" | "Failure"; value?: any; cause?: any }> => {
    if (typeof command === "function") {
      try {
        const res = await command(args);
        if (res && (res._tag === "Success" || res._tag === "Failure")) {
          return res;
        }
        return { _tag: "Success", value: res };
      } catch (err) {
        return { _tag: "Failure", cause: { error: err } };
      }
    }
    return { _tag: "Success" };
  };
}
