use std::path::PathBuf;

use anyhow::Result;
use async_trait::async_trait;
use next_transform_react_server_components::{server_components, Config, Options};
use swc_core::{
    common::util::take::Take,
    ecma::{
        ast::{Module, Program},
        visit::FoldWith,
    },
};
use turbo_tasks::{ValueToString, Vc};
use turbo_tasks_fs::FileSystemPath;
use turbopack_binding::turbopack::ecmascript::{
    CustomTransformer, OptionTransformPlugin, TransformContext,
};

#[derive(Debug)]
pub struct ServerComponentsTransformer {
    app_dir: Vc<FileSystemPath>,
    is_server: bool,
    bundle_target: Vc<String>,
}

impl ServerComponentsTransformer {
    pub fn new(app_dir: Vc<FileSystemPath>, is_server: bool, bundle_target: Vc<String>) -> Self {
        Self {
            app_dir,
            is_server,
            bundle_target,
        }
    }
}

#[async_trait]
impl CustomTransformer for ServerComponentsTransformer {
    async fn transform(&self, program: &mut Program, ctx: &TransformContext<'_>) -> Result<()> {
        let app_dir = &*self.app_dir.to_string().await?;
        let bundle_target = &*self.bundle_target.await?;
        let p = std::mem::replace(program, Program::Module(Module::dummy()));

        *program = p.fold_with(&mut server_components(
            ctx.file_name_str.to_string(),
            Config::WithOptions(Options {
                is_server: self.is_server,
            }),
            ctx.comments.clone(),
            Some(PathBuf::from(app_dir)),
            bundle_target.to_string().into(),
            true
        ));

        Ok(())
    }
}

#[turbo_tasks::function]
pub async fn get_react_server_components_transform_plugin(
    app_dir: Vc<FileSystemPath>,
    is_app_dir: bool,
    is_server: bool,
    bundle_target: Vc<String>,
) -> Result<Vc<OptionTransformPlugin>> {
    if !is_app_dir {
        return Ok(Vc::cell(Default::default()));
    }

    let transformer = ServerComponentsTransformer::new(app_dir, is_server, bundle_target);
    return Ok(Vc::cell(Some(Vc::cell(Box::new(transformer) as _))));
}
